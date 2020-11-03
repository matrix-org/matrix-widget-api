/*
 * Copyright 2020 The Matrix.org Foundation C.I.C.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *         http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { EventEmitter } from "events";
import { ITransport } from "./transport/ITransport";
import { Widget } from "./models/Widget";
import { PostmessageTransport } from "./transport/PostmessageTransport";
import { WidgetApiDirection } from "./interfaces/WidgetApiDirection";
import { IWidgetApiRequest, IWidgetApiRequestEmptyData } from "./interfaces/IWidgetApiRequest";
import { IContentLoadedActionRequest } from "./interfaces/ContentLoadedAction";
import { WidgetApiFromWidgetAction, WidgetApiToWidgetAction } from "./interfaces/WidgetApiAction";
import { IWidgetApiErrorResponseData } from "./interfaces/IWidgetApiErrorResponse";
import { Capability } from "./interfaces/Capabilities";
import { ISendEventDetails, WidgetDriver } from "./driver/WidgetDriver";
import { ICapabilitiesActionResponseData } from "./interfaces/CapabilitiesAction";
import {
    ISupportedVersionsActionRequest,
    ISupportedVersionsActionResponseData,
} from "./interfaces/SupportedVersionsAction";
import { CurrentApiVersions } from "./interfaces/ApiVersion";
import { IScreenshotActionResponseData } from "./interfaces/ScreenshotAction";
import { IVisibilityActionRequestData } from "./interfaces/VisibilityAction";
import { IWidgetApiResponseData } from "./interfaces/IWidgetApiResponse";
import {
    IModalWidgetButtonClickedRequestData,
    IModalWidgetOpenRequestData,
    IModalWidgetOpenRequestDataButton,
    IModalWidgetReturnData,
} from "./interfaces/ModalWidgetActions";
import {
    ISendEventFromWidgetActionRequest,
    ISendEventFromWidgetResponseData,
    ISendEventToWidgetRequestData,
} from "./interfaces/SendEventAction";
import { EventDirection, WidgetEventCapability } from "./models/WidgetEventCapability";
import { IRoomEvent } from "./interfaces/IRoomEvent";

/**
 * API handler for the client side of widgets. This raises events
 * for each action received as `action:${action}` (eg: "action:screenshot").
 * Default handling can be prevented by using preventDefault() on the
 * raised event. The default handling varies for each action: ones
 * which the SDK can handle safely are acknowledged appropriately and
 * ones which are unhandled (custom or require the client to do something)
 * are rejected with an error.
 *
 * Events which are preventDefault()ed must reply using the transport.
 * The events raised will have a default of an IWidgetApiRequest
 * interface.
 *
 * When the ClientWidgetApi is ready to start sending requests, it will
 * raise a "ready" CustomEvent. After the ready event fires, actions can
 * be sent and the transport will be ready.
 *
 * When the widget has indicated it has loaded, this class raises a
 * "preparing" CustomEvent. The preparing event does not indicate that
 * the widget is ready to receive communications - that is signified by
 * the ready event exclusively.
 *
 * This class only handles one widget at a time.
 */
export class ClientWidgetApi extends EventEmitter {
    public readonly transport: ITransport;

    private capabilitiesFinished = false;
    private allowedCapabilities = new Set<Capability>();
    private allowedEvents: WidgetEventCapability[] = [];
    private isStopped = false;

    /**
     * Creates a new client widget API. This will instantiate the transport
     * and start everything. When the iframe is loaded under the widget's
     * conditions, a "ready" event will be raised.
     * @param {Widget} widget The widget to communicate with.
     * @param {HTMLIFrameElement} iframe The iframe the widget is in.
     * @param {WidgetDriver} driver The driver for this widget/client.
     */
    public constructor(
        public readonly widget: Widget,
        private iframe: HTMLIFrameElement,
        private driver: WidgetDriver,
    ) {
        super();
        if (!iframe?.contentWindow) {
            throw new Error("No iframe supplied");
        }
        if (!widget) {
            throw new Error("Invalid widget");
        }
        if (!driver) {
            throw new Error("Invalid driver");
        }
        this.transport = new PostmessageTransport(
            WidgetApiDirection.ToWidget,
            widget.id,
            iframe.contentWindow,
            window,
        );
        this.transport.targetOrigin = widget.origin;
        this.transport.on("message", this.handleMessage.bind(this));

        if (widget.waitForIframeLoad) {
            iframe.addEventListener("load", this.onIframeLoad.bind(this));
        }

        this.transport.start();
    }

    public hasCapability(capability: Capability): boolean {
        return this.allowedCapabilities.has(capability);
    }

    public canSendRoomEvent(eventType: string, msgtype: string = null): boolean {
        return this.allowedEvents.some(e =>
            e.matchesAsRoomEvent(eventType, msgtype) && e.direction === EventDirection.Send);
    }

    public canSendStateEvent(eventType: string, stateKey: string): boolean {
        return this.allowedEvents.some(e =>
            e.matchesAsStateEvent(eventType, stateKey) && e.direction === EventDirection.Send);
    }

    public canReceiveRoomEvent(eventType: string, msgtype: string = null): boolean {
        return this.allowedEvents.some(e =>
            e.matchesAsRoomEvent(eventType, msgtype) && e.direction === EventDirection.Receive);
    }

    public canReceiveStateEvent(eventType: string, stateKey: string): boolean {
        return this.allowedEvents.some(e =>
            e.matchesAsStateEvent(eventType, stateKey) && e.direction === EventDirection.Receive);
    }

    public stop() {
        this.isStopped = true;
        this.transport.stop();
    }

    private onIframeLoad(ev: Event) {
        this.beginCapabilities();

        // We don't need the listener anymore
        this.iframe.removeEventListener("onload", this.onIframeLoad.bind(this));
    }

    private beginCapabilities() {
        if (this.capabilitiesFinished) {
            throw new Error("Capabilities exchange already completed");
        }

        // widget has loaded - tell all the listeners that
        this.emit("preparing");

        this.transport.send<IWidgetApiRequestEmptyData, ICapabilitiesActionResponseData>(
            WidgetApiToWidgetAction.Capabilities, {},
        ).then(caps => {
            return this.driver.validateCapabilities(new Set(caps.capabilities));
        }).then(allowedCaps => {
            console.log(`Widget ${this.widget.id} is allowed capabilities:`, Array.from(allowedCaps));
            this.allowedCapabilities = allowedCaps;
            this.allowedEvents = Array.from(new Set(WidgetEventCapability.findEventCapabilities(allowedCaps)));
            this.capabilitiesFinished = true;
            this.emit("ready");
        });
    }

    private handleContentLoadedAction(action: IContentLoadedActionRequest) {
        if (this.widget.waitForIframeLoad) {
            this.transport.reply(action, <IWidgetApiErrorResponseData>{
                error: {
                    message: "Improper sequence: not expecting load event",
                },
            });
        } else {
            this.transport.reply(action, <IWidgetApiRequestEmptyData>{});
            this.beginCapabilities();
        }
    }

    private replyVersions(request: ISupportedVersionsActionRequest) {
        this.transport.reply<ISupportedVersionsActionResponseData>(request, {
            supported_versions: CurrentApiVersions,
        });
    }

    private async handleSendEvent(request: ISendEventFromWidgetActionRequest) {
        if (!request.data.type) {
            return this.transport.reply<IWidgetApiErrorResponseData>(request, {
                error: {message: "Invalid request - missing event type"},
            });
        }

        const isState = request.data.state_key !== null && request.data.state_key !== undefined;
        let sentEvent: ISendEventDetails;
        if (isState) {
            if (!this.canSendStateEvent(request.data.type, request.data.state_key)) {
                return this.transport.reply<IWidgetApiErrorResponseData>(request, {
                    error: {message: "Cannot send state events of this type"},
                });
            }

            try {
                sentEvent = await this.driver.sendEvent(
                    request.data.type,
                    request.data.content || {},
                    request.data.state_key,
                );
            } catch (e) {
                console.error("error sending event: ", e);
                return this.transport.reply<IWidgetApiErrorResponseData>(request, {
                    error: {message: "Error sending event"},
                });
            }
        } else {
            const content = request.data.content || {};
            const msgtype = content['msgtype'];
            if (!this.canSendRoomEvent(request.data.type, msgtype)) {
                return this.transport.reply<IWidgetApiErrorResponseData>(request, {
                    error: {message: "Cannot send room events of this type"},
                });
            }

            try {
                sentEvent = await this.driver.sendEvent(
                    request.data.type,
                    content,
                    null, // not sending a state event
                );
            } catch (e) {
                console.error("error sending event: ", e);
                return this.transport.reply<IWidgetApiErrorResponseData>(request, {
                    error: {message: "Error sending event"},
                });
            }
        }

        return this.transport.reply<ISendEventFromWidgetResponseData>(request, {
            room_id: sentEvent.roomId,
            event_id: sentEvent.eventId,
        });
    }

    private handleMessage(ev: CustomEvent<IWidgetApiRequest>) {
        if (this.isStopped) return;
        const actionEv = new CustomEvent(`action:${ev.detail.action}`, {
            detail: ev.detail,
            cancelable: true,
        });
        this.emit(`action:${ev.detail.action}`, actionEv);
        if (!actionEv.defaultPrevented) {
            switch (ev.detail.action) {
                case WidgetApiFromWidgetAction.ContentLoaded:
                    return this.handleContentLoadedAction(<IContentLoadedActionRequest>ev.detail);
                case WidgetApiFromWidgetAction.SupportedApiVersions:
                    return this.replyVersions(<ISupportedVersionsActionRequest>ev.detail);
                case WidgetApiFromWidgetAction.SendEvent:
                    return this.handleSendEvent(<ISendEventFromWidgetActionRequest>ev.detail);
                default:
                    return this.transport.reply(ev.detail, <IWidgetApiErrorResponseData>{
                        error: {
                            message: "Unknown or unsupported action: " + ev.detail.action,
                        },
                    });
            }
        }
    }

    /**
     * Takes a screenshot of the widget.
     * @returns Resolves to the widget's screenshot.
     * @throws Throws if there is a problem.
     */
    public takeScreenshot(): Promise<IScreenshotActionResponseData> {
        return this.transport.send(WidgetApiToWidgetAction.TakeScreenshot, <IWidgetApiRequestEmptyData>{});
    }

    /**
     * Alerts the widget to whether or not it is currently visible.
     * @param {boolean} isVisible Whether the widget is visible or not.
     * @returns {Promise<IWidgetApiResponseData>} Resolves when the widget acknowledges the update.
     */
    public updateVisibility(isVisible: boolean): Promise<IWidgetApiResponseData> {
        return this.transport.send(WidgetApiToWidgetAction.UpdateVisibility, <IVisibilityActionRequestData>{
            visible: isVisible,
        });
    }

    public sendWidgetConfig(data: IModalWidgetOpenRequestData): Promise<void> {
        return this.transport.send<IModalWidgetOpenRequestData>(WidgetApiToWidgetAction.WidgetConfig, data).then();
    }

    public notifyModalWidgetButtonClicked(id: IModalWidgetOpenRequestDataButton["id"]): Promise<void> {
        return this.transport.send<IModalWidgetButtonClickedRequestData>(
            WidgetApiToWidgetAction.ButtonClicked, {id},
        ).then();
    }

    public notifyModalWidgetClose(data: IModalWidgetReturnData): Promise<void> {
        return this.transport.send<IModalWidgetReturnData>(
            WidgetApiToWidgetAction.CloseModalWidget, data,
        ).then();
    }

    /**
     * Feeds an event to the widget. If the widget is not able to accept the event due to
     * permissions, this will no-op and return calmly. If the widget failed to handle the
     * event, this will raise an error.
     * @param {IRoomEvent} rawEvent The event to (try to) send to the widget.
     * @returns {Promise<void>} Resolves when complete, rejects if there was an error sending.
     */
    public feedEvent(rawEvent: IRoomEvent): Promise<void> {
        if (rawEvent.state_key !== undefined && rawEvent.state_key !== null) {
            // state event
            if (!this.canReceiveStateEvent(rawEvent.type, rawEvent.state_key)) {
                return Promise.resolve(); // no-op
            }
        } else {
            // message event
            if (!this.canReceiveRoomEvent(rawEvent.type, (rawEvent.content || {})['msgtype'])) {
                return Promise.resolve(); // no-op
            }
        }

        // Feed the event into the widget
        return this.transport.send<ISendEventToWidgetRequestData>(
            WidgetApiToWidgetAction.SendEvent,
            rawEvent as ISendEventToWidgetRequestData, // it's compatible, but missing the index signature
        ).then();
    }
}

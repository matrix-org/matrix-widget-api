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
import { WidgetDriver } from "./driver/WidgetDriver";
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
            this.allowedCapabilities = allowedCaps;
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
}

/*
 * Copyright 2020 - 2024 The Matrix.org Foundation C.I.C.
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
import { Capability, MatrixCapabilities } from "./interfaces/Capabilities";
import { IOpenIDUpdate, ISendEventDetails, ISendDelayedEventDetails, WidgetDriver } from "./driver/WidgetDriver";
import {
    ICapabilitiesActionResponseData,
    INotifyCapabilitiesActionRequestData,
    IRenegotiateCapabilitiesActionRequest,
} from "./interfaces/CapabilitiesAction";
import {
    ISupportedVersionsActionRequest,
    ISupportedVersionsActionResponseData,
} from "./interfaces/SupportedVersionsAction";
import { CurrentApiVersions } from "./interfaces/ApiVersion";
import { IScreenshotActionResponseData } from "./interfaces/ScreenshotAction";
import { IVisibilityActionRequestData } from "./interfaces/VisibilityAction";
import { IWidgetApiAcknowledgeResponseData, IWidgetApiResponseData } from "./interfaces/IWidgetApiResponse";
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
import {
    ISendToDeviceFromWidgetActionRequest,
    ISendToDeviceFromWidgetResponseData,
    ISendToDeviceToWidgetRequestData,
} from "./interfaces/SendToDeviceAction";
import { EventDirection, WidgetEventCapability } from "./models/WidgetEventCapability";
import { IRoomEvent } from "./interfaces/IRoomEvent";
import { IRoomAccountData } from "./interfaces/IRoomAccountData";
import {
    IGetOpenIDActionRequest,
    IGetOpenIDActionResponseData,
    IOpenIDCredentials,
    OpenIDRequestState,
} from "./interfaces/GetOpenIDAction";
import { SimpleObservable } from "./util/SimpleObservable";
import { IOpenIDCredentialsActionRequestData } from "./interfaces/OpenIDCredentialsAction";
import { INavigateActionRequest } from "./interfaces/NavigateAction";
import { IReadEventFromWidgetActionRequest, IReadEventFromWidgetResponseData } from "./interfaces/ReadEventAction";
import {
    ITurnServer,
    IWatchTurnServersRequest,
    IUnwatchTurnServersRequest,
    IUpdateTurnServersRequestData,
} from "./interfaces/TurnServerActions";
import { Symbols } from "./Symbols";
import {
    IReadRelationsFromWidgetActionRequest,
    IReadRelationsFromWidgetResponseData,
} from "./interfaces/ReadRelationsAction";
import {
    IUserDirectorySearchFromWidgetActionRequest,
    IUserDirectorySearchFromWidgetResponseData,
} from "./interfaces/UserDirectorySearchAction";
import {
    IReadRoomAccountDataFromWidgetActionRequest,
    IReadRoomAccountDataFromWidgetResponseData,
} from "./interfaces/ReadRoomAccountDataAction";
import {
    IGetMediaConfigActionFromWidgetActionRequest,
    IGetMediaConfigActionFromWidgetResponseData,
} from "./interfaces/GetMediaConfigAction";
import {
    IUpdateDelayedEventFromWidgetActionRequest,
    UpdateDelayedEventAction,
} from "./interfaces/UpdateDelayedEventAction";
import {
    IUploadFileActionFromWidgetActionRequest,
    IUploadFileActionFromWidgetResponseData,
} from "./interfaces/UploadFileAction";
import {
    IDownloadFileActionFromWidgetActionRequest,
    IDownloadFileActionFromWidgetResponseData,
} from "./interfaces/DownloadFileAction";

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

    // contentLoadedActionSent is used to check that only one ContentLoaded request is send.
    private contentLoadedActionSent = false;
    private allowedCapabilities = new Set<Capability>();
    private allowedEvents: WidgetEventCapability[] = [];
    private isStopped = false;
    private turnServers: AsyncGenerator<ITurnServer> | null = null;
    private contentLoadedWaitTimer?: ReturnType<typeof setTimeout>;

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

        iframe.addEventListener("load", this.onIframeLoad.bind(this));

        this.transport.start();
    }

    public hasCapability(capability: Capability): boolean {
        return this.allowedCapabilities.has(capability);
    }

    public canUseRoomTimeline(roomId: string | Symbols.AnyRoom): boolean {
        return this.hasCapability(`org.matrix.msc2762.timeline:${Symbols.AnyRoom}`)
            || this.hasCapability(`org.matrix.msc2762.timeline:${roomId}`);
    }

    public canSendRoomEvent(eventType: string, msgtype: string | null = null): boolean {
        return this.allowedEvents.some(e => e.matchesAsRoomEvent(EventDirection.Send, eventType, msgtype));
    }

    public canSendStateEvent(eventType: string, stateKey: string): boolean {
        return this.allowedEvents.some(e => e.matchesAsStateEvent(EventDirection.Send, eventType, stateKey));
    }

    public canSendToDeviceEvent(eventType: string): boolean {
        return this.allowedEvents.some(e => e.matchesAsToDeviceEvent(EventDirection.Send, eventType));
    }

    public canReceiveRoomEvent(eventType: string, msgtype: string | null = null): boolean {
        return this.allowedEvents.some(e => e.matchesAsRoomEvent(EventDirection.Receive, eventType, msgtype));
    }

    public canReceiveStateEvent(eventType: string, stateKey: string | null): boolean {
        return this.allowedEvents.some(e => e.matchesAsStateEvent(EventDirection.Receive, eventType, stateKey));
    }

    public canReceiveToDeviceEvent(eventType: string): boolean {
        return this.allowedEvents.some(e => e.matchesAsToDeviceEvent(EventDirection.Receive, eventType));
    }

    public canReceiveRoomAccountData(eventType: string): boolean {
        return this.allowedEvents.some(e => e.matchesAsRoomAccountData(EventDirection.Receive, eventType));
    }

    public stop(): void {
        this.isStopped = true;
        this.transport.stop();
    }

    private beginCapabilities(): void {
        // widget has loaded - tell all the listeners that
        this.emit("preparing");

        let requestedCaps: Capability[];
        this.transport.send<IWidgetApiRequestEmptyData, ICapabilitiesActionResponseData>(
            WidgetApiToWidgetAction.Capabilities, {},
        ).then(caps => {
            requestedCaps = caps.capabilities;
            return this.driver.validateCapabilities(new Set(caps.capabilities));
        }).then(allowedCaps => {
            console.log(`Widget ${this.widget.id} is allowed capabilities:`, Array.from(allowedCaps));
            this.allowedCapabilities = allowedCaps;
            this.allowedEvents = WidgetEventCapability.findEventCapabilities(allowedCaps);
            this.notifyCapabilities(requestedCaps);
            this.emit("ready");
        }).catch(e => {
            this.emit("error:preparing", e);
        });
    }

    private notifyCapabilities(requested: Capability[]): void {
        this.transport.send(WidgetApiToWidgetAction.NotifyCapabilities, <INotifyCapabilitiesActionRequestData>{
            requested: requested,
            approved: Array.from(this.allowedCapabilities),
        }).catch(e => {
            console.warn("non-fatal error notifying widget of approved capabilities:", e);
        }).then(() => {
            this.emit("capabilitiesNotified");
        });
    }

    private onIframeLoad(ev: Event): void {
        if (this.widget.waitForIframeLoad) {
            // If the widget is set to waitForIframeLoad the capabilities immediatly get setup after load.
            // The client does not wait for the ContentLoaded action.
            this.beginCapabilities();
        } else {
            // Reaching this means, that the Iframe got reloaded/loaded and
            // the clientApi is awaiting the FIRST ContentLoaded action.
            console.log("waitForIframeLoad is false: waiting for widget to send contentLoaded");
            this.contentLoadedWaitTimer = setTimeout(() => {
                console.error(
                    "Widget specified waitForIframeLoad=false but timed out waiting for contentLoaded event!",
                );
            }, 10000);
            this.contentLoadedActionSent = false;
        }
    }

    private handleContentLoadedAction(action: IContentLoadedActionRequest): void {
        if (this.contentLoadedWaitTimer !== undefined) {
            clearTimeout(this.contentLoadedWaitTimer);
            this.contentLoadedWaitTimer = undefined;
        }
        if (this.contentLoadedActionSent) {
            throw new Error("Improper sequence: ContentLoaded Action can only be sent once after the widget loaded "
                            +"and should only be used if waitForIframeLoad is false (default=true)");
        }
        if (this.widget.waitForIframeLoad) {
            this.transport.reply(action, <IWidgetApiErrorResponseData>{
                error: {
                    message: "Improper sequence: not expecting ContentLoaded event if "
                    +"waitForIframeLoad is true (default=true)",
                },
            });
        } else {
            this.transport.reply(action, <IWidgetApiRequestEmptyData>{});
            this.beginCapabilities();
        }
        this.contentLoadedActionSent = true;
    }

    private replyVersions(request: ISupportedVersionsActionRequest): void {
        this.transport.reply<ISupportedVersionsActionResponseData>(request, {
            supported_versions: CurrentApiVersions,
        });
    }

    private handleCapabilitiesRenegotiate(request: IRenegotiateCapabilitiesActionRequest): void {
        // acknowledge first
        this.transport.reply<IWidgetApiAcknowledgeResponseData>(request, {});

        const requested = request.data?.capabilities || [];
        const newlyRequested = new Set(requested.filter(r => !this.hasCapability(r)));
        if (newlyRequested.size === 0) {
            // Nothing to do - notify capabilities
            return this.notifyCapabilities([]);
        }

        this.driver.validateCapabilities(newlyRequested).then(allowed => {
            allowed.forEach(c => this.allowedCapabilities.add(c));

            const allowedEvents = WidgetEventCapability.findEventCapabilities(allowed);
            allowedEvents.forEach(c => this.allowedEvents.push(c));

            return this.notifyCapabilities(Array.from(newlyRequested));
        });
    }

    private handleNavigate(request: INavigateActionRequest): void {
        if (!this.hasCapability(MatrixCapabilities.MSC2931Navigate)) {
            return this.transport.reply<IWidgetApiErrorResponseData>(request, {
                error: {message: "Missing capability"},
            });
        }

        if (!request.data?.uri || !request.data?.uri.toString().startsWith("https://matrix.to/#")) {
            return this.transport.reply<IWidgetApiErrorResponseData>(request, {
                error: {message: "Invalid matrix.to URI"},
            });
        }

        const onErr = (e: unknown): void => {
            console.error("[ClientWidgetApi] Failed to handle navigation: ", e);
            this.handleDriverError(e, request, "Error handling navigation");
        };

        try {
            this.driver.navigate(request.data.uri.toString()).catch((e: unknown) => onErr(e)).then(() => {
                return this.transport.reply<IWidgetApiAcknowledgeResponseData>(request, {});
            });
        } catch (e) {
            return onErr(e);
        }
    }

    private handleOIDC(request: IGetOpenIDActionRequest): void {
        let phase = 1; // 1 = initial request, 2 = after user manual confirmation

        const replyState = (state: OpenIDRequestState, credential?: IOpenIDCredentials): void | Promise<IWidgetApiAcknowledgeResponseData> => {
            credential = credential || {};
            if (phase > 1) {
                return this.transport.send<IOpenIDCredentialsActionRequestData>(
                    WidgetApiToWidgetAction.OpenIDCredentials,
                    {
                        state: state,
                        original_request_id: request.requestId,
                        ...credential,
                    },
                );
            } else {
                return this.transport.reply<IGetOpenIDActionResponseData>(request, {
                    state: state,
                    ...credential,
                });
            }
        };

        const replyError = (msg: string): void | Promise<IWidgetApiAcknowledgeResponseData> => {
            console.error("[ClientWidgetApi] Failed to handle OIDC: ", msg);
            if (phase > 1) {
                // We don't have a way to indicate that a random error happened in this flow, so
                // just block the attempt.
                return replyState(OpenIDRequestState.Blocked);
            } else {
                return this.transport.reply<IWidgetApiErrorResponseData>(request, {
                    error: {message: msg},
                });
            }
        };

        const observer = new SimpleObservable<IOpenIDUpdate>(update => {
            if (update.state === OpenIDRequestState.PendingUserConfirmation && phase > 1) {
                observer.close();
                return replyError("client provided out-of-phase response to OIDC flow");
            }

            if (update.state === OpenIDRequestState.PendingUserConfirmation) {
                replyState(update.state);
                phase++;
                return;
            }

            if (update.state === OpenIDRequestState.Allowed && !update.token) {
                return replyError("client provided invalid OIDC token for an allowed request");
            }
            if (update.state === OpenIDRequestState.Blocked) {
                update.token = undefined; // just in case the client did something weird
            }

            observer.close();
            return replyState(update.state, update.token);
        });

        this.driver.askOpenID(observer);
    }
    private handleReadRoomAccountData(request: IReadRoomAccountDataFromWidgetActionRequest): void | Promise<void> {
        let events: Promise<IRoomAccountData[]> = Promise.resolve([]);
        events = this.driver.readRoomAccountData(request.data.type);

        if (!this.canReceiveRoomAccountData(request.data.type)) {
            return this.transport.reply<IWidgetApiErrorResponseData>(request, {
                error: {message: "Cannot read room account data of this type"},
            });
        }

        return events.then((evs) => {
            this.transport.reply<IReadRoomAccountDataFromWidgetResponseData>(request, {events: evs});
        });
    }

    private handleReadEvents(request: IReadEventFromWidgetActionRequest): void | Promise<void> {
        if (!request.data.type) {
            return this.transport.reply<IWidgetApiErrorResponseData>(request, {
                error: {message: "Invalid request - missing event type"},
            });
        }
        if (request.data.limit !== undefined && (!request.data.limit || request.data.limit < 0)) {
            return this.transport.reply<IWidgetApiErrorResponseData>(request, {
                error: {message: "Invalid request - limit out of range"},
            });
        }

        let askRoomIds: string[] | null = null; // null denotes current room only
        if (request.data.room_ids) {
            if (Array.isArray(request.data.room_ids)) {
                askRoomIds = request.data.room_ids;
            } else {
                askRoomIds = [request.data.room_ids];
            }
            for (const roomId of askRoomIds) {
                if (!this.canUseRoomTimeline(roomId)) {
                    return this.transport.reply<IWidgetApiErrorResponseData>(request, {
                        error: {message: `Unable to access room timeline: ${roomId}`},
                    });
                }
            }
        }

        const limit = request.data.limit || 0;
        const since = request.data.since;

        let events: Promise<IRoomEvent[]> = Promise.resolve([]);
        if (request.data.state_key !== undefined) {
            const stateKey = request.data.state_key === true ? undefined : request.data.state_key.toString();
            if (!this.canReceiveStateEvent(request.data.type, stateKey ?? null)) {
                return this.transport.reply<IWidgetApiErrorResponseData>(request, {
                    error: {message: "Cannot read state events of this type"},
                });
            }
            events = this.driver.readStateEvents(request.data.type, stateKey, limit, askRoomIds);
        } else {
            if (!this.canReceiveRoomEvent(request.data.type, request.data.msgtype)) {
                return this.transport.reply<IWidgetApiErrorResponseData>(request, {
                    error: {message: "Cannot read room events of this type"},
                });
            }
            events = this.driver.readRoomEvents(request.data.type, request.data.msgtype, limit, askRoomIds, since);
        }

        return events.then(evs => this.transport.reply<IReadEventFromWidgetResponseData>(request, {events: evs}));
    }

    private handleSendEvent(request: ISendEventFromWidgetActionRequest): void {
        if (!request.data.type) {
            return this.transport.reply<IWidgetApiErrorResponseData>(request, {
                error: {message: "Invalid request - missing event type"},
            });
        }

        if (!!request.data.room_id && !this.canUseRoomTimeline(request.data.room_id)) {
            return this.transport.reply<IWidgetApiErrorResponseData>(request, {
                error: {message: `Unable to access room timeline: ${request.data.room_id}`},
            });
        }

        const isDelayedEvent = request.data.delay !== undefined || request.data.parent_delay_id !== undefined;
        if (isDelayedEvent && !this.hasCapability(MatrixCapabilities.MSC4157SendDelayedEvent)) {
            return this.transport.reply<IWidgetApiErrorResponseData>(request, {
                error: {message: "Missing capability"},
            });
        }

        let sendEventPromise: Promise<ISendEventDetails|ISendDelayedEventDetails>;
        if (request.data.state_key !== undefined) {
            if (!this.canSendStateEvent(request.data.type, request.data.state_key)) {
                return this.transport.reply<IWidgetApiErrorResponseData>(request, {
                    error: {message: "Cannot send state events of this type"},
                });
            }

            if (!isDelayedEvent) {
                sendEventPromise = this.driver.sendEvent(
                    request.data.type,
                    request.data.content || {},
                    request.data.state_key,
                    request.data.room_id,
                );
            } else {
                sendEventPromise = this.driver.sendDelayedEvent(
                    request.data.delay ?? null,
                    request.data.parent_delay_id ?? null,
                    request.data.type,
                    request.data.content || {},
                    request.data.state_key,
                    request.data.room_id,
                );
            }
        } else {
            const content = request.data.content as { msgtype?: string } || {};
            const msgtype = content['msgtype'];
            if (!this.canSendRoomEvent(request.data.type, msgtype)) {
                return this.transport.reply<IWidgetApiErrorResponseData>(request, {
                    error: {message: "Cannot send room events of this type"},
                });
            }

            if (!isDelayedEvent) {
                sendEventPromise = this.driver.sendEvent(
                    request.data.type,
                    content,
                    null, // not sending a state event
                    request.data.room_id,
                );
            } else {
                sendEventPromise = this.driver.sendDelayedEvent(
                    request.data.delay ?? null,
                    request.data.parent_delay_id ?? null,
                    request.data.type,
                    content,
                    null, // not sending a state event
                    request.data.room_id,
                );
            }
        }

        sendEventPromise.then(sentEvent => {
            return this.transport.reply<ISendEventFromWidgetResponseData>(request, {
                room_id: sentEvent.roomId,
                ...("eventId" in sentEvent ? {
                    event_id: sentEvent.eventId,
                } : {
                    delay_id: sentEvent.delayId,
                }),
            });
        }).catch((e: unknown) => {
            console.error("error sending event: ", e);
            this.handleDriverError(e, request, "Error sending event");
        });
    }

    private handleUpdateDelayedEvent(request: IUpdateDelayedEventFromWidgetActionRequest): void {
        if (!request.data.delay_id) {
            return this.transport.reply<IWidgetApiErrorResponseData>(request, {
                error: {message: "Invalid request - missing delay_id"},
            });
        }

        if (!this.hasCapability(MatrixCapabilities.MSC4157UpdateDelayedEvent)) {
            return this.transport.reply<IWidgetApiErrorResponseData>(request, {
                error: {message: "Missing capability"},
            });
        }

        switch (request.data.action) {
            case UpdateDelayedEventAction.Cancel:
            case UpdateDelayedEventAction.Restart:
            case UpdateDelayedEventAction.Send:
                this.driver.updateDelayedEvent(request.data.delay_id, request.data.action).then(() => {
                    return this.transport.reply<IWidgetApiAcknowledgeResponseData>(request, {});
                }).catch((e: unknown) => {
                    console.error("error updating delayed event: ", e);
                    this.handleDriverError(e, request, "Error updating delayed event");
                });
                break;
            default:
                return this.transport.reply<IWidgetApiErrorResponseData>(request, {
                    error: {message: "Invalid request - unsupported action"},
                });
        }
    }

    private async handleSendToDevice(request: ISendToDeviceFromWidgetActionRequest): Promise<void> {
        if (!request.data.type) {
            await this.transport.reply<IWidgetApiErrorResponseData>(request, {
                error: {message: "Invalid request - missing event type"},
            });
        } else if (!request.data.messages) {
            await this.transport.reply<IWidgetApiErrorResponseData>(request, {
                error: {message: "Invalid request - missing event contents"},
            });
        } else if (typeof request.data.encrypted !== "boolean") {
            await this.transport.reply<IWidgetApiErrorResponseData>(request, {
                error: {message: "Invalid request - missing encryption flag"},
            });
        } else if (!this.canSendToDeviceEvent(request.data.type)) {
            await this.transport.reply<IWidgetApiErrorResponseData>(request, {
                error: {message: "Cannot send to-device events of this type"},
            });
        } else {
            try {
                await this.driver.sendToDevice(request.data.type, request.data.encrypted, request.data.messages);
                await this.transport.reply<ISendToDeviceFromWidgetResponseData>(request, {});
            } catch (e) {
                console.error("error sending to-device event", e);
                this.handleDriverError(e, request, "Error sending event");
            }
        }
    }

    private async pollTurnServers(turnServers: AsyncGenerator<ITurnServer>, initialServer: ITurnServer): Promise<void> {
        try {
            await this.transport.send<IUpdateTurnServersRequestData>(
                WidgetApiToWidgetAction.UpdateTurnServers,
                initialServer as IUpdateTurnServersRequestData, // it's compatible, but missing the index signature
            );

            // Pick the generator up where we left off
            for await (const server of turnServers) {
                await this.transport.send<IUpdateTurnServersRequestData>(
                    WidgetApiToWidgetAction.UpdateTurnServers,
                    server as IUpdateTurnServersRequestData, // it's compatible, but missing the index signature
                );
            }
        } catch (e) {
            console.error("error polling for TURN servers", e);
        }
    }

    private async handleWatchTurnServers(request: IWatchTurnServersRequest): Promise<void> {
        if (!this.hasCapability(MatrixCapabilities.MSC3846TurnServers)) {
            await this.transport.reply<IWidgetApiErrorResponseData>(request, {
                error: {message: "Missing capability"},
            });
        } else if (this.turnServers) {
            // We're already polling, so this is a no-op
            await this.transport.reply<IWidgetApiAcknowledgeResponseData>(request, {});
        } else {
            try {
                const turnServers = this.driver.getTurnServers();

                // Peek at the first result, so we can at least verify that the
                // client isn't banned from getting TURN servers entirely
                const { done, value } = await turnServers.next();
                if (done) throw new Error("Client refuses to provide any TURN servers");
                await this.transport.reply<IWidgetApiAcknowledgeResponseData>(request, {});

                // Start the poll loop, sending the widget the initial result
                this.pollTurnServers(turnServers, value);
                this.turnServers = turnServers;
            } catch (e) {
                console.error("error getting first TURN server results", e);
                await this.transport.reply<IWidgetApiErrorResponseData>(request, {
                    error: {message: "TURN servers not available"},
                });
            }
        }
    }

    private async handleUnwatchTurnServers(request: IUnwatchTurnServersRequest): Promise<void> {
        if (!this.hasCapability(MatrixCapabilities.MSC3846TurnServers)) {
            await this.transport.reply<IWidgetApiErrorResponseData>(request, {
                error: {message: "Missing capability"},
            });
        } else if (!this.turnServers) {
            // We weren't polling anyways, so this is a no-op
            await this.transport.reply<IWidgetApiAcknowledgeResponseData>(request, {});
        } else {
            // Stop the generator, allowing it to clean up
            await this.turnServers.return(undefined);
            this.turnServers = null;
            await this.transport.reply<IWidgetApiAcknowledgeResponseData>(request, {});
        }
    }

    private async handleReadRelations(request: IReadRelationsFromWidgetActionRequest): Promise<void> {
        if (!request.data.event_id) {
            return this.transport.reply<IWidgetApiErrorResponseData>(request, {
                error: { message: "Invalid request - missing event ID" },
            });
        }

        if (request.data.limit !== undefined && request.data.limit < 0) {
            return this.transport.reply<IWidgetApiErrorResponseData>(request, {
                error: { message: "Invalid request - limit out of range" },
            });
        }

        if (request.data.room_id !== undefined && !this.canUseRoomTimeline(request.data.room_id)) {
            return this.transport.reply<IWidgetApiErrorResponseData>(request, {
                error: { message: `Unable to access room timeline: ${request.data.room_id}` },
            });
        }

        try {
            const result = await this.driver.readEventRelations(
                request.data.event_id, request.data.room_id, request.data.rel_type,
                request.data.event_type, request.data.from, request.data.to,
                request.data.limit, request.data.direction,
            );

            // only return events that the user has the permission to receive
            const chunk = result.chunk.filter(e => {
                if (e.state_key !== undefined) {
                    return this.canReceiveStateEvent(e.type, e.state_key);
                } else {
                    return this.canReceiveRoomEvent(e.type, (e.content as { msgtype?: string })['msgtype']);
                }
            });

            return this.transport.reply<IReadRelationsFromWidgetResponseData>(
                request,
                {
                    chunk,
                    prev_batch: result.prevBatch,
                    next_batch: result.nextBatch,
                },
            );
        } catch (e) {
            console.error("error getting the relations", e);
            this.handleDriverError(e, request, "Unexpected error while reading relations");
        }
    }

    private async handleUserDirectorySearch(request: IUserDirectorySearchFromWidgetActionRequest): Promise<void> {
        if (!this.hasCapability(MatrixCapabilities.MSC3973UserDirectorySearch)) {
            return this.transport.reply<IWidgetApiErrorResponseData>(request, {
                error: { message: "Missing capability" },
            });
        }

        if (typeof request.data.search_term !== 'string') {
            return this.transport.reply<IWidgetApiErrorResponseData>(request, {
                error: { message: "Invalid request - missing search term" },
            });
        }

        if (request.data.limit !== undefined && request.data.limit < 0) {
            return this.transport.reply<IWidgetApiErrorResponseData>(request, {
                error: { message: "Invalid request - limit out of range" },
            });
        }

        try {
            const result = await this.driver.searchUserDirectory(
                request.data.search_term, request.data.limit,
            );

            return this.transport.reply<IUserDirectorySearchFromWidgetResponseData>(
                request,
                {
                    limited: result.limited,
                    results: result.results.map(r => ({
                        user_id: r.userId,
                        display_name: r.displayName,
                        avatar_url: r.avatarUrl,
                    })),
                },
            );
        } catch (e) {
            console.error("error searching in the user directory", e);
            this.handleDriverError(e, request, "Unexpected error while searching in the user directory");
        }
    }

    private async handleGetMediaConfig(request: IGetMediaConfigActionFromWidgetActionRequest): Promise<void> {
        if (!this.hasCapability(MatrixCapabilities.MSC4039UploadFile)) {
            return this.transport.reply<IWidgetApiErrorResponseData>(request, {
                error: { message: "Missing capability" },
            });
        }

        try {
            const result = await this.driver.getMediaConfig();

            return this.transport.reply<IGetMediaConfigActionFromWidgetResponseData>(
                request,
                result,
            );
        } catch (e) {
            console.error("error while getting the media configuration", e);
            this.handleDriverError(e, request, "Unexpected error while getting the media configuration");
        }
    }

    private async handleUploadFile(request: IUploadFileActionFromWidgetActionRequest): Promise<void> {
        if (!this.hasCapability(MatrixCapabilities.MSC4039UploadFile)) {
            return this.transport.reply<IWidgetApiErrorResponseData>(request, {
                error: { message: "Missing capability" },
            });
        }

        try {
            const result = await this.driver.uploadFile(request.data.file);

            return this.transport.reply<IUploadFileActionFromWidgetResponseData>(
                request,
                { content_uri: result.contentUri },
            );
        } catch (e) {
            console.error("error while uploading a file", e);
            this.handleDriverError(e, request, "Unexpected error while uploading a file");
        }
    }

    private async handleDownloadFile(request: IDownloadFileActionFromWidgetActionRequest): Promise<void> {
        if (!this.hasCapability(MatrixCapabilities.MSC4039DownloadFile)) {
            return this.transport.reply<IWidgetApiErrorResponseData>(request, {
                error: { message: "Missing capability" },
            });
        }

        try {
            const result = await this.driver.downloadFile(request.data.content_uri);

            return this.transport.reply<IDownloadFileActionFromWidgetResponseData>(
                request,
                { file: result.file },
            );
        } catch (e) {
            console.error("error while downloading a file", e);
            this.handleDriverError(e, request, "Unexpected error while downloading a file");
        }
    }

    private handleDriverError(e: unknown, request: IWidgetApiRequest, message: string): void {
        const data = this.driver.processError(e);
        this.transport.reply<IWidgetApiErrorResponseData>(request, {
            error: {
                message,
                ...data,
            },
        });
    }

    private handleMessage(ev: CustomEvent<IWidgetApiRequest>): void | Promise<void> {
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
                case WidgetApiFromWidgetAction.SendToDevice:
                    return this.handleSendToDevice(<ISendToDeviceFromWidgetActionRequest>ev.detail);
                case WidgetApiFromWidgetAction.GetOpenIDCredentials:
                    return this.handleOIDC(<IGetOpenIDActionRequest>ev.detail);
                case WidgetApiFromWidgetAction.MSC2931Navigate:
                    return this.handleNavigate(<INavigateActionRequest>ev.detail);
                case WidgetApiFromWidgetAction.MSC2974RenegotiateCapabilities:
                    return this.handleCapabilitiesRenegotiate(<IRenegotiateCapabilitiesActionRequest>ev.detail);
                case WidgetApiFromWidgetAction.MSC2876ReadEvents:
                    return this.handleReadEvents(<IReadEventFromWidgetActionRequest>ev.detail);
                case WidgetApiFromWidgetAction.WatchTurnServers:
                    return this.handleWatchTurnServers(<IWatchTurnServersRequest>ev.detail);
                case WidgetApiFromWidgetAction.UnwatchTurnServers:
                    return this.handleUnwatchTurnServers(<IUnwatchTurnServersRequest>ev.detail);
                case WidgetApiFromWidgetAction.MSC3869ReadRelations:
                    return this.handleReadRelations(<IReadRelationsFromWidgetActionRequest>ev.detail);
                case WidgetApiFromWidgetAction.MSC3973UserDirectorySearch:
                    return this.handleUserDirectorySearch(<IUserDirectorySearchFromWidgetActionRequest>ev.detail);
                case WidgetApiFromWidgetAction.BeeperReadRoomAccountData:
                    return this.handleReadRoomAccountData(<IReadRoomAccountDataFromWidgetActionRequest>ev.detail);
                case WidgetApiFromWidgetAction.MSC4039GetMediaConfigAction:
                    return this.handleGetMediaConfig(<IGetMediaConfigActionFromWidgetActionRequest>ev.detail);
                case WidgetApiFromWidgetAction.MSC4039UploadFileAction:
                    return this.handleUploadFile(<IUploadFileActionFromWidgetActionRequest>ev.detail);
                case WidgetApiFromWidgetAction.MSC4039DownloadFileAction:
                    return this.handleDownloadFile(<IDownloadFileActionFromWidgetActionRequest>ev.detail);
                case WidgetApiFromWidgetAction.MSC4157UpdateDelayedEvent:
                    return this.handleUpdateDelayedEvent(<IUpdateDelayedEventFromWidgetActionRequest>ev.detail);

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
     * @param {string} currentViewedRoomId The room ID the user is currently interacting with.
     * Not the room ID of the event.
     * @returns {Promise<void>} Resolves when complete, rejects if there was an error sending.
     */
    public async feedEvent(rawEvent: IRoomEvent, currentViewedRoomId: string): Promise<void> {
        if (rawEvent.room_id !== currentViewedRoomId && !this.canUseRoomTimeline(rawEvent.room_id)) {
            return; // no-op
        }

        if (rawEvent.state_key !== undefined && rawEvent.state_key !== null) {
            // state event
            if (!this.canReceiveStateEvent(rawEvent.type, rawEvent.state_key)) {
                return; // no-op
            }
        } else {
            // message event
            if (!this.canReceiveRoomEvent(rawEvent.type, (rawEvent.content as { msgtype?: string })?.["msgtype"])) {
                return; // no-op
            }
        }

        // Feed the event into the widget
        await this.transport.send<ISendEventToWidgetRequestData>(
            WidgetApiToWidgetAction.SendEvent,
            rawEvent as ISendEventToWidgetRequestData, // it's compatible, but missing the index signature
        );
    }

    /**
     * Feeds a to-device event to the widget. If the widget is not able to accept the
     * event due to permissions, this will no-op and return calmly. If the widget failed
     * to handle the event, this will raise an error.
     * @param {IRoomEvent} rawEvent The event to (try to) send to the widget.
     * @param {boolean} encrypted Whether the event contents were encrypted.
     * @returns {Promise<void>} Resolves when complete, rejects if there was an error sending.
     */
    public async feedToDevice(rawEvent: IRoomEvent, encrypted: boolean): Promise<void> {
        if (this.canReceiveToDeviceEvent(rawEvent.type)) {
            await this.transport.send<ISendToDeviceToWidgetRequestData>(
                WidgetApiToWidgetAction.SendToDevice,
                // it's compatible, but missing the index signature
                { ...rawEvent, encrypted } as ISendToDeviceToWidgetRequestData,
            );
        }
    }
}

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

import { Capability } from "./interfaces/Capabilities";
import { IWidgetApiRequest, IWidgetApiRequestEmptyData } from "./interfaces/IWidgetApiRequest";
import { WidgetApiDirection } from "./interfaces/WidgetApiDirection";
import {
    ISupportedVersionsActionRequest,
    ISupportedVersionsActionResponseData,
} from "./interfaces/SupportedVersionsAction";
import { CurrentApiVersions } from "./interfaces/ApiVersion";
import { ICapabilitiesActionRequest, ICapabilitiesActionResponseData } from "./interfaces/CapabilitiesAction";
import { ITransport } from "./transport/ITransport";
import { PostmessageTransport } from "./transport/PostmessageTransport";
import { WidgetApiFromWidgetAction, WidgetApiToWidgetAction } from "./interfaces/WidgetApiAction";
import { IWidgetApiErrorResponseData } from "./interfaces/IWidgetApiErrorResponse";
import { IStickerActionRequestData } from "./interfaces/StickerAction";
import { IStickyActionRequestData, IStickyActionResponseData } from "./interfaces/StickyAction";
import { AlmostEventEmitter } from "./AlmostEventEmitter";
import {
    IGetOpenIDActionRequestData,
    IGetOpenIDActionResponse,
    IOpenIDCredentials,
    OpenIDRequestState,
} from "./interfaces/GetOpenIDAction";
import { IOpenIDCredentialsActionRequest } from "./interfaces/OpenIDCredentialsAction";
import { WidgetType } from "./interfaces/WidgetType";
import {
    IModalWidgetCreateData,
    IModalWidgetOpenRequestData,
    IModalWidgetOpenRequestDataButton,
    IModalWidgetReturnData,
} from "./interfaces/ModalWidgetActions";

/**
 * API handler for widgets. This raises events for each action
 * received as `action:${action}` (eg: "action:screenshot").
 * Default handling can be prevented by using preventDefault()
 * on the raised event. The default handling varies for each
 * action: ones which the SDK can handle safely are acknowledged
 * appropriately and ones which are unhandled (custom or require
 * the widget to do something) are rejected with an error.
 *
 * Events which are preventDefault()ed must reply using the
 * transport. The events raised will have a detail of an
 * IWidgetApiRequest interface.
 *
 * When the WidgetApi is ready to start sending requests, it will
 * raise a "ready" CustomEvent. After the ready event fires, actions
 * can be sent and the transport will be ready.
 */
export class WidgetApi extends AlmostEventEmitter {
    public readonly transport: ITransport;

    private capabilitiesFinished = false;
    private requestedCapabilities: Capability[] = [];

    /**
     * Creates a new API handler for the given widget.
     * @param {string} widgetId The widget ID to listen for. If not supplied then
     * the API will use the widget ID from the first valid request it receives.
     * @param {string} clientOrigin The origin of the client, or null if not known.
     */
    public constructor(widgetId: string = null, private clientOrigin: string = null) {
        super();
        if (!window.parent) {
            throw new Error("No parent window. This widget doesn't appear to be embedded properly.");
        }
        this.transport = new PostmessageTransport(
            WidgetApiDirection.FromWidget,
            widgetId,
            window.parent,
            window,
        );
        this.transport.targetOrigin = clientOrigin;
        this.transport.addEventListener("message", this.handleMessage.bind(this));
    }

    /**
     * Request a capability from the client. It is not guaranteed to be allowed,
     * but will be asked for if the negotiation has not already happened.
     * @param {Capability} capability The capability to request.
     * @throws Throws if the capabilities negotiation has already started.
     */
    public requestCapability(capability: Capability) {
        if (this.capabilitiesFinished) {
            throw new Error("Capabilities have already been negotiated");
        }

        this.requestedCapabilities.push(capability);
    }

    /**
     * Request capabilities from the client. They are not guaranteed to be allowed,
     * but will be asked for if the negotiation has not already happened.
     * @param {Capability[]} capabilities The capabilities to request.
     * @throws Throws if the capabilities negotiation has already started.
     */
    public requestCapabilities(capabilities: Capability[]) {
        capabilities.forEach(cap => this.requestCapability(cap));
    }

    /**
     * Requests an OpenID Connect token from the client for the currently logged in
     * user. This token can be validated server-side with the federation API.
     * @returns {Promise<IOpenIDCredentials>} Resolves to a token for verification.
     * @throws Throws if the user rejected the request or the request failed.
     */
    public requestOpenIDConnectToken(): Promise<IOpenIDCredentials> {
        return new Promise<IOpenIDCredentials>((resolve, reject) => {
            this.transport.sendComplete<IGetOpenIDActionRequestData, IGetOpenIDActionResponse>(
                WidgetApiFromWidgetAction.GetOpenIDCredentials, {},
            ).then(response => {
                const rdata = response.response;
                if (rdata.state === OpenIDRequestState.Allowed) {
                    resolve(rdata);
                } else if (rdata.state === OpenIDRequestState.Blocked) {
                    reject(new Error("User declined to verify their identity"));
                } else if (rdata.state === OpenIDRequestState.PendingUserConfirmation) {
                    const handlerFn = (ev: CustomEvent<IOpenIDCredentialsActionRequest>) => {
                        ev.preventDefault();
                        const request = ev.detail;
                        if (request.data.original_request_id !== response.requestId) return;
                        if (request.data.state === OpenIDRequestState.Allowed) {
                            resolve(request.data);
                            this.transport.reply(request, <IWidgetApiRequestEmptyData>{}); // ack
                        } else if (request.data.state === OpenIDRequestState.Blocked) {
                            reject(new Error("User declined to verify their identity"));
                            this.transport.reply(request, <IWidgetApiRequestEmptyData>{}); // ack
                        } else {
                            reject(new Error("Invalid state on reply: " + rdata.state));
                            this.transport.reply(request, <IWidgetApiErrorResponseData>{
                                error: {
                                    message: "Invalid state",
                                },
                            });
                        }
                        this.removeEventListener(`action:${WidgetApiToWidgetAction.OpenIDCredentials}`, handlerFn);
                    };
                    this.addEventListener(`action:${WidgetApiToWidgetAction.OpenIDCredentials}`, handlerFn);
                } else {
                    reject(new Error("Invalid state: " + rdata.state));
                }
            });
        });
    }

    /**
     * Tell the client that the content has been loaded.
     * @returns {Promise} Resolves when the client acknowledges the request.
     */
    public sendContentLoaded(): Promise<void> {
        return this.transport.send(WidgetApiFromWidgetAction.ContentLoaded, <IWidgetApiRequestEmptyData>{}).then();
    }

    /**
     * Sends a sticker to the client.
     * @param {IStickerActionRequestData} sticker The sticker to send.
     * @returns {Promise} Resolves when the client acknowledges the request.
     */
    public sendSticker(sticker: IStickerActionRequestData): Promise<void> {
        return this.transport.send(WidgetApiFromWidgetAction.SendSticker, sticker).then();
    }

    /**
     * Asks the client to set the always-on-screen status for this widget.
     * @param {boolean} value The new state to request.
     * @returns {Promise<boolean>} Resolve with true if the client was able to fulfill
     * the request, resolves to false otherwise. Rejects if an error occurred.
     */
    public setAlwaysOnScreen(value: boolean): Promise<boolean> {
        return this.transport.send<IStickyActionRequestData, IStickyActionResponseData>(
            WidgetApiFromWidgetAction.UpdateAlwaysOnScreen, {value},
        ).then(res => res.success);
    }

    public openModalWidget(
        url: string,
        name: string,
        buttons: IModalWidgetOpenRequestDataButton[] = [],
        data: IModalWidgetCreateData = {},
        type: WidgetType = "m.custom",
    ): Promise<void> {
        return this.transport.send<IModalWidgetOpenRequestData>(
            WidgetApiFromWidgetAction.OpenModalWidget, { type, url, name, buttons, data },
        ).then();
    }

    public closeModalWidget(data: IModalWidgetReturnData = {}): Promise<void> {
        return this.transport.send<IModalWidgetReturnData>(WidgetApiFromWidgetAction.CloseModalWidget, data).then();
    }

    /**
     * Starts the communication channel. This should be done early to ensure
     * that messages are not missed. Communication can only be stopped by the client.
     */
    public start() {
        this.transport.start();
    }

    private handleMessage(ev: CustomEvent<IWidgetApiRequest>) {
        const actionEv = new CustomEvent(`action:${ev.detail.action}`, {
            detail: ev.detail,
            cancelable: true,
        });
        this.dispatchEvent(actionEv);
        if (!actionEv.defaultPrevented) {
            switch (ev.detail.action) {
                case WidgetApiToWidgetAction.SupportedApiVersions:
                    return this.replyVersions(<ISupportedVersionsActionRequest>ev.detail);
                case WidgetApiToWidgetAction.Capabilities:
                    return this.handleCapabilities(<ICapabilitiesActionRequest>ev.detail);
                case WidgetApiToWidgetAction.UpdateVisibility:
                    return this.transport.reply(ev.detail, <IWidgetApiRequestEmptyData>{}); // ack to avoid error spam
                default:
                    return this.transport.reply(ev.detail, <IWidgetApiErrorResponseData>{
                        error: {
                            message: "Unknown or unsupported action: " + ev.detail.action,
                        },
                    });
            }
        }
    }

    private replyVersions(request: ISupportedVersionsActionRequest) {
        this.transport.reply<ISupportedVersionsActionResponseData>(request, {
            supported_versions: CurrentApiVersions,
        });
    }

    private handleCapabilities(request: ICapabilitiesActionRequest) {
        if (this.capabilitiesFinished) {
            return this.transport.reply<IWidgetApiErrorResponseData>(request, {
                error: {
                    message: "Capability negotiation already completed",
                },
            });
        }
        this.capabilitiesFinished = true;
        this.dispatchEvent(new CustomEvent("ready"));
        return this.transport.reply<ICapabilitiesActionResponseData>(request, {
            capabilities: this.requestedCapabilities,
        });
    }
}

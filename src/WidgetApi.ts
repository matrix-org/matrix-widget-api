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
import { IWidgetApiRequest } from "./interfaces/IWidgetApiRequest";
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

/**
 * API handler for widgets. This raises events for each unhandled
 * action received and for the following actions in particular:
 * * `visible` (detail of IVisibilityActionRequest)
 * * `screenshot` (detail of IScreenshotActionRequest)
 * To reply, call `reply` on the transport associated with this API.
 */
export class WidgetApi extends EventTarget {
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
        this.transport = new PostmessageTransport(WidgetApiDirection.FromWidget, widgetId);
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
     * Tell the client that the content has been loaded.
     * @returns {Promise} Resolves when the client acknowledges the request.
     */
    public sendContentLoaded(): Promise<void> {
        return this.transport.send(WidgetApiFromWidgetAction.ContentLoaded, {}).then();
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

    /**
     * Starts the communication channel. This should be done early to ensure
     * that messages are not missed. Communication can only be stopped by the client.
     */
    public start() {
        this.transport.start();
    }

    private handleMessage(ev: CustomEvent<IWidgetApiRequest>) {
        switch (ev.detail.action) {
            case WidgetApiToWidgetAction.SupportedApiVersions:
                return this.replyVersions(<ISupportedVersionsActionRequest>ev.detail);
            case WidgetApiToWidgetAction.Capabilities:
                return this.handleCapabilities(<ICapabilitiesActionRequest>ev.detail);
            default:
                this.dispatchEvent(new CustomEvent(ev.detail.action, {detail: ev.detail}));
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
        return this.transport.reply<ICapabilitiesActionResponseData>(request, {
            capabilities: this.requestedCapabilities,
        });
    }
}

/*
 * Copyright 2026 The Matrix.org Foundation C.I.C.
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

import { IWidgetApiRequest, IWidgetApiRequestData } from "./IWidgetApiRequest";
import { IWidgetApiResponseData } from "./IWidgetApiResponse";
import { WidgetApiFromWidgetAction } from "./WidgetApiAction";

/**
 * The MatrixRTC member a LiveKit request is made for.
 * @see {@link https://github.com/matrix-org/matrix-spec-proposals/pull/4195|MSC4195}
 */
export interface IRtcLivekitMember {
    /** The identifier of the member within the MatrixRTC session. */
    id: string;
    /** The device ID the member claims to be using. */
    claimed_device_id?: string; // eslint-disable-line camelcase
}

export interface IRtcLivekitGetTokenFromWidgetRequestData extends IWidgetApiRequestData {
    /** The name of the homeserver hosting the MatrixRTC session. */
    server_name: string; // eslint-disable-line camelcase
    /** The URL of the LiveKit SFU to obtain a token for. */
    url: string;
    /** The room the MatrixRTC session belongs to. */
    room_id: string; // eslint-disable-line camelcase
    /** The MatrixRTC session (slot) to join. */
    slot_id: string; // eslint-disable-line camelcase
    member: IRtcLivekitMember;
}

export interface IRtcLivekitGetTokenFromWidgetActionRequest extends IWidgetApiRequest {
    action: WidgetApiFromWidgetAction.MSC4533RtcLivekitGetToken;
    data: IRtcLivekitGetTokenFromWidgetRequestData;
}

export interface IRtcLivekitGetTokenFromWidgetResponseData extends IWidgetApiResponseData {
    /** The JWT to authenticate against the SFU with. */
    jwt: string;
}

export interface IRtcLivekitGetTokenFromWidgetActionResponse extends IRtcLivekitGetTokenFromWidgetActionRequest {
    response: IRtcLivekitGetTokenFromWidgetResponseData;
}

export interface IRtcLivekitDelegateDelayedLeaveFromWidgetRequestData extends IWidgetApiRequestData {
    /** The room the MatrixRTC session belongs to. */
    room_id: string; // eslint-disable-line camelcase
    /** The MatrixRTC session (slot) the delayed leave event belongs to. */
    slot_id: string; // eslint-disable-line camelcase
    member: IRtcLivekitMember;
    /** The ID of the delayed leave event to hand over to the server. */
    delay_id: string; // eslint-disable-line camelcase
}

export interface IRtcLivekitDelegateDelayedLeaveFromWidgetActionRequest extends IWidgetApiRequest {
    action: WidgetApiFromWidgetAction.MSC4533RtcLivekitDelegateDelayedLeave;
    data: IRtcLivekitDelegateDelayedLeaveFromWidgetRequestData;
}

export interface IRtcLivekitDelegateDelayedLeaveFromWidgetResponseData extends IWidgetApiResponseData {
    // nothing
}

export interface IRtcLivekitDelegateDelayedLeaveFromWidgetActionResponse
    extends IRtcLivekitDelegateDelayedLeaveFromWidgetActionRequest {
    response: IRtcLivekitDelegateDelayedLeaveFromWidgetResponseData;
}

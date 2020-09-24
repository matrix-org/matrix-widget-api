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

import { IWidgetApiRequest, IWidgetApiRequestData } from "./IWidgetApiRequest";
import { WidgetApiFromWidgetAction } from "./WidgetApiAction";
import { IWidgetApiResponseData } from "./IWidgetApiResponse";

export enum OpenIDRequestState {
    Allowed = "allowed",
    Blocked = "blocked",
    PendingUserConfirmation = "request",
}

export interface IOpenIDCredentials {
    access_token?: string;
    expires_in?: number;
    matrix_server_name?: string;
    token_type?: "Bearer" | string;
}

export interface IGetOpenIDActionRequestData extends IWidgetApiRequestData {
    // nothing
}

export interface IGetOpenIDActionRequest extends IWidgetApiRequest {
    action: WidgetApiFromWidgetAction.GetOpenIDCredentials;
    data: IGetOpenIDActionRequestData;
}

export interface IGetOpenIDActionResponseData extends IWidgetApiResponseData, IOpenIDCredentials {
    state: OpenIDRequestState;
}

export interface IGetOpenIDActionResponse extends IGetOpenIDActionRequest {
    response: IGetOpenIDActionResponseData;
}

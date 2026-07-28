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

export interface IRtcTransport {
    /**
     * The globally unique transport identifier. Follows the Common Namespaced
     * Identifier Grammar (without the namespacing requirement).
     */
    type: string;
    /** Further transport-specific properties, defined by the transport's specification.*/
    [key: string]: unknown;
}

export interface IRtcTransportsFromWidgetRequestData extends IWidgetApiRequestData {}

export interface IRtcTransportsFromWidgetActionRequest extends IWidgetApiRequest {
    action: WidgetApiFromWidgetAction.MSC4515GetRtcTransports;
    data: IRtcTransportsFromWidgetRequestData;
}

export interface IRtcTransportsFromWidgetResponseData extends IWidgetApiResponseData {
    rtc_transports: IRtcTransport[];
}

export interface IRtcTransportsFromWidgetActionResponse extends IRtcTransportsFromWidgetActionRequest {
    response: IRtcTransportsFromWidgetResponseData;
}

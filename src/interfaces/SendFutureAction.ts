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

import { IWidgetApiRequest } from "./IWidgetApiRequest";
import { IWidgetApiResponseData } from "./IWidgetApiResponse";
import { ISendEventFromWidgetRequestData } from "./SendEventAction";
import { WidgetApiFromWidgetAction } from "./WidgetApiAction";

export interface ISendFutureOptions {
    future_group_id?: string; // eslint-disable-line camelcase
    future_timeout?: number; // eslint-disable-line camelcase
}

export interface ISendFutureFromWidgetRequestData extends ISendEventFromWidgetRequestData, ISendFutureOptions {}

export interface ISendFutureFromWidgetActionRequest extends IWidgetApiRequest {
    action: WidgetApiFromWidgetAction.SendFuture;
    data: ISendFutureFromWidgetRequestData;
}

export interface ISendFutureFromWidgetResponseData extends IWidgetApiResponseData {
    future_group_id: string; // eslint-disable-line camelcase
    send_token: string; // eslint-disable-line camelcase
    cancel_token: string; // eslint-disable-line camelcase
    refresh_token?: string; // eslint-disable-line camelcase
}

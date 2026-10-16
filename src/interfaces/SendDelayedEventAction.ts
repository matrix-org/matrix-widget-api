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

export interface ISendDelayedEventFromWidgetRequestData extends IWidgetApiRequestData {
    state_key?: string; // eslint-disable-line camelcase
    type: string;
    content: unknown;
    room_id?: string; // eslint-disable-line camelcase
    delay_ms: number; // eslint-disable-line camelcase
    sticky_duration_ms?: number; // eslint-disable-line camelcase
}

export interface ISendDelayedEventFromWidgetActionRequest extends IWidgetApiRequest {
    action: WidgetApiFromWidgetAction.MSC4157SendDelayedEvent;
    data: ISendDelayedEventFromWidgetRequestData;
}

export interface ISendDelayedEventFromWidgetResponseData extends IWidgetApiResponseData {
    room_id: string; // eslint-disable-line camelcase
    delay_id: string; // eslint-disable-line camelcase
}

export interface ISendDelayedEventFromWidgetActionResponse extends ISendDelayedEventFromWidgetActionRequest {
    response: ISendDelayedEventFromWidgetResponseData;
}

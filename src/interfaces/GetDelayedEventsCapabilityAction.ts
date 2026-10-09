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
 * The limits a homeserver enforces on delayed events (MSC4140). A value of `0` in
 * either field means that delayed events are disabled.
 */
export interface IDelayedEventsCapability {
    /** The maximum delay the homeserver allows for a delayed event, in milliseconds. */
    max_delay_ms: number;
    /** The maximum number of delayed events a user may have scheduled at once. */
    max_scheduled: number;
}

export interface IGetDelayedEventsCapabilityFromWidgetRequestData extends IWidgetApiRequestData {}

export interface IGetDelayedEventsCapabilityFromWidgetActionRequest extends IWidgetApiRequest {
    action: WidgetApiFromWidgetAction.MSC4157GetDelayedEventsCapability;
    data: IGetDelayedEventsCapabilityFromWidgetRequestData;
}

export interface IGetDelayedEventsCapabilityFromWidgetResponseData extends IWidgetApiResponseData {
    /** The homeserver's delayed events capability, absent if the homeserver does not advertise it. */
    "m.delayed_events"?: IDelayedEventsCapability;
}

export interface IGetDelayedEventsCapabilityFromWidgetActionResponse
    extends IGetDelayedEventsCapabilityFromWidgetActionRequest {
    response: IGetDelayedEventsCapabilityFromWidgetResponseData;
}

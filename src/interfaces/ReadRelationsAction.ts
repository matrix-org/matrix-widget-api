/*
 * Copyright 2022 The Matrix.org Foundation C.I.C.
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

import { IRoomEvent } from "./IRoomEvent";
import { IWidgetApiRequest, IWidgetApiRequestData } from "./IWidgetApiRequest";
import { IWidgetApiResponseData } from "./IWidgetApiResponse";
import { WidgetApiFromWidgetAction } from "./WidgetApiAction";

export interface IReadRelationsFromWidgetRequestData extends IWidgetApiRequestData {
    event_id: string; // eslint-disable-line camelcase
    rel_type?: string; // eslint-disable-line camelcase
    event_type?: string; // eslint-disable-line camelcase
    room_id?: string; // eslint-disable-line camelcase

    limit?: number;
    from?: string;
    to?: string;
    direction?: 'f' | 'b';
}

export interface IReadRelationsFromWidgetActionRequest extends IWidgetApiRequest {
    action: WidgetApiFromWidgetAction.MSC3869ReadRelations;
    data: IReadRelationsFromWidgetRequestData;
}

export interface IReadRelationsFromWidgetResponseData extends IWidgetApiResponseData {
    original_event: IRoomEvent | undefined; // eslint-disable-line camelcase
    chunk: IRoomEvent[];

    next_batch?: string; // eslint-disable-line camelcase
    prev_batch?: string; // eslint-disable-line camelcase
}

export interface IReadRelationsFromWidgetActionResponse extends IReadRelationsFromWidgetActionRequest {
    response: IReadRelationsFromWidgetResponseData;
}

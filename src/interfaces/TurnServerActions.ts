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

import { IWidgetApiRequest, IWidgetApiRequestData, IWidgetApiRequestEmptyData } from "./IWidgetApiRequest";
import { WidgetApiFromWidgetAction, WidgetApiToWidgetAction } from "./WidgetApiAction";
import { IWidgetApiAcknowledgeResponseData, IWidgetApiResponse } from "./IWidgetApiResponse";

export interface ITurnServer {
    uris: string[];
    username: string;
    password: string;
}

export interface IWatchTurnServersRequest extends IWidgetApiRequest {
    action: WidgetApiFromWidgetAction.WatchTurnServers;
    data: IWidgetApiRequestEmptyData;
}

export interface IWatchTurnServersResponse extends IWidgetApiResponse {
    response: IWidgetApiAcknowledgeResponseData;
}

export interface IUnwatchTurnServersRequest extends IWidgetApiRequest {
    action: WidgetApiFromWidgetAction.UnwatchTurnServers;
    data: IWidgetApiRequestEmptyData;
}

export interface IUnwatchTurnServersResponse extends IWidgetApiResponse {
    response: IWidgetApiAcknowledgeResponseData;
}

export interface IUpdateTurnServersRequestData extends IWidgetApiRequestData, ITurnServer {
}

export interface IUpdateTurnServersRequest extends IWidgetApiRequest {
    action: WidgetApiToWidgetAction.UpdateTurnServers;
    data: IUpdateTurnServersRequestData;
}

export interface IUpdateTurnServersResponse extends IWidgetApiResponse {
    response: IWidgetApiAcknowledgeResponseData;
}

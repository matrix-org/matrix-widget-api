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

import { IWidgetApiRequest, IWidgetApiRequestData } from "./IWidgetApiRequest";
import { WidgetApiFromWidgetAction, WidgetApiToWidgetAction } from "./WidgetApiAction";
import { IWidgetApiResponseData } from "./IWidgetApiResponse";
import { IToDeviceMessage } from "./IToDeviceMessage";

export interface ISendToDeviceFromWidgetRequestData extends IWidgetApiRequestData {
    type: string;
    encrypted: boolean;
    messages: { [userId: string]: { [deviceId: string]: object } };
}

export interface ISendToDeviceFromWidgetActionRequest extends IWidgetApiRequest {
    action: WidgetApiFromWidgetAction.SendToDevice;
    data: ISendToDeviceFromWidgetRequestData;
}

export interface ISendToDeviceFromWidgetResponseData extends IWidgetApiResponseData {
    // nothing
}

export interface ISendToDeviceFromWidgetActionResponse extends ISendToDeviceFromWidgetActionRequest {
    response: ISendToDeviceFromWidgetResponseData;
}

export interface ISendToDeviceToWidgetRequestData extends IWidgetApiRequestData, IToDeviceMessage {
    encrypted: boolean;
}

export interface ISendToDeviceToWidgetActionRequest extends IWidgetApiRequest {
    action: WidgetApiToWidgetAction.SendToDevice;
    data: ISendToDeviceToWidgetRequestData;
}

export interface ISendToDeviceToWidgetResponseData extends IWidgetApiResponseData {
    // nothing
}

export interface ISendToDeviceToWidgetActionResponse extends ISendToDeviceToWidgetActionRequest {
    response: ISendToDeviceToWidgetResponseData;
}

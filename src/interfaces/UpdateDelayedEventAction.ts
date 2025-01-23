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

import { IWidgetApiRequest, IWidgetApiRequestData } from "./IWidgetApiRequest";
import { WidgetApiFromWidgetAction } from "./WidgetApiAction";
import { IWidgetApiResponseData } from "./IWidgetApiResponse";

export enum UpdateDelayedEventAction {
  Cancel = "cancel",
  Restart = "restart",
  Send = "send",
}

export interface IUpdateDelayedEventFromWidgetRequestData
  extends IWidgetApiRequestData {
  delay_id: string; // eslint-disable-line camelcase
  action: UpdateDelayedEventAction;
}

export interface IUpdateDelayedEventFromWidgetActionRequest
  extends IWidgetApiRequest {
  action: WidgetApiFromWidgetAction.MSC4157UpdateDelayedEvent;
  data: IUpdateDelayedEventFromWidgetRequestData;
}

export interface IUpdateDelayedEventFromWidgetResponseData
  extends IWidgetApiResponseData {
  // nothing
}

export interface IUpdateDelayedEventFromWidgetActionResponse
  extends IUpdateDelayedEventFromWidgetActionRequest {
  response: IUpdateDelayedEventFromWidgetResponseData;
}

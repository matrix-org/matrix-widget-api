/*
 * Copyright 2024 The Matrix.org Foundation C.I.C.
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
import { WidgetApiToWidgetAction } from "./WidgetApiAction";
import { IWidgetApiResponseData } from "./IWidgetApiResponse";
import { IRoomEvent } from "./IRoomEvent";

export interface IUpdateStateToWidgetRequestData extends IWidgetApiRequestData {
  state: IRoomEvent[];
}

export interface IUpdateStateToWidgetActionRequest extends IWidgetApiRequest {
  action: WidgetApiToWidgetAction.UpdateState;
  data: IUpdateStateToWidgetRequestData;
}

export interface IUpdateStateToWidgetResponseData
  extends IWidgetApiResponseData {
  // nothing
}

export interface IUpdateStateToWidgetActionResponse
  extends IUpdateStateToWidgetActionRequest {
  response: IUpdateStateToWidgetResponseData;
}

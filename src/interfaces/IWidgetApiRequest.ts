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

import { WidgetApiDirection } from "./WidgetApiDirection";
import { WidgetApiAction } from "./WidgetApiAction";

export interface IWidgetApiRequestData {
    [key: string]: unknown;
}

export interface IWidgetApiRequestEmptyData extends IWidgetApiRequestData {
    // nothing
}

export interface IWidgetApiRequest {
    api: WidgetApiDirection;
    requestId: string;
    action: WidgetApiAction;
    widgetId: string;
    data: IWidgetApiRequestData;
    // XXX: This is for Scalar support
    // TODO: Fix scalar
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    visible?: any;
}

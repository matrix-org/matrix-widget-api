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

export enum WidgetApiToWidgetAction {
    SupportedApiVersions = "supported_api_versions",
    Capabilities = "capabilities",
    TakeScreenshot = "screenshot",
    UpdateVisibility = "visibility",
}

export enum WidgetApiFromWidgetAction {
    SupportedApiVersions = "supported_api_versions",
    ContentLoaded = "content_loaded",
    SendSticker = "m.sticker",
    UpdateAlwaysOnScreen = "set_always_on_screen",
}

export type WidgetApiAction = WidgetApiToWidgetAction | WidgetApiFromWidgetAction | string;

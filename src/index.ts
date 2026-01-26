/*
Copyright 2020 - 2021 The Matrix.org Foundation C.I.C.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

        http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

// Primary structures
export * from "./WidgetApi";
export * from "./ClientWidgetApi";
export * from "./Symbols";

// Transports (not sure why you'd use these directly, but might as well export all the things)
export type * from "./transport/ITransport";
export * from "./transport/PostmessageTransport";

// Interfaces and simple models
export type * from "./interfaces/ICustomWidgetData";
export type * from "./interfaces/IJitsiWidgetData";
export type * from "./interfaces/IStickerpickerWidgetData";
export type * from "./interfaces/IWidget";
export * from "./interfaces/WidgetType";
export * from "./interfaces/IWidgetApiErrorResponse";
export type * from "./interfaces/IWidgetApiRequest";
export type * from "./interfaces/IWidgetApiResponse";
export * from "./interfaces/WidgetApiAction";
export * from "./interfaces/WidgetApiDirection";
export * from "./interfaces/ApiVersion";
export * from "./interfaces/Capabilities";
export type * from "./interfaces/CapabilitiesAction";
export type * from "./interfaces/ContentLoadedAction";
export type * from "./interfaces/ScreenshotAction";
export type * from "./interfaces/StickerAction";
export type * from "./interfaces/StickyAction";
export type * from "./interfaces/SupportedVersionsAction";
export type * from "./interfaces/VisibilityAction";
export * from "./interfaces/GetOpenIDAction";
export type * from "./interfaces/OpenIDCredentialsAction";
export * from "./interfaces/WidgetKind";
export * from "./interfaces/ModalButtonKind";
export * from "./interfaces/ModalWidgetActions";
export type * from "./interfaces/SetModalButtonEnabledAction";
export type * from "./interfaces/WidgetConfigAction";
export type * from "./interfaces/SendEventAction";
export type * from "./interfaces/SendToDeviceAction";
export type * from "./interfaces/ReadEventAction";
export type * from "./interfaces/IRoomEvent";
export type * from "./interfaces/IRoomAccountData";
export type * from "./interfaces/NavigateAction";
export type * from "./interfaces/TurnServerActions";
export type * from "./interfaces/ReadRelationsAction";
export type * from "./interfaces/GetMediaConfigAction";
export * from "./interfaces/UpdateDelayedEventAction";
export type * from "./interfaces/UpdateStateAction";
export type * from "./interfaces/UploadFileAction";
export type * from "./interfaces/DownloadFileAction";
export type * from "./interfaces/ThemeChangeAction";
export type * from "./interfaces/LanguageChangeAction";
export type * from "./interfaces/PushInitialStickyStateAction";

// Complex models
export * from "./models/WidgetEventCapability";
export * from "./models/validation/url";
export * from "./models/validation/utils";
export * from "./models/Widget";
export * from "./models/WidgetParser";

// Utilities
export * from "./templating/url-template";
export * from "./util/SimpleObservable";

// Drivers
export * from "./driver/WidgetDriver";

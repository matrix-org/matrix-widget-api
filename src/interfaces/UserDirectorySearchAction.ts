/*
 * Copyright 2023 Nordeck IT + Consulting GmbH.
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

export interface IUserDirectorySearchFromWidgetRequestData extends IWidgetApiRequestData {
    search_term: string; // eslint-disable-line camelcase
    limit?: number;
}

export interface IUserDirectorySearchFromWidgetActionRequest extends IWidgetApiRequest {
    action: WidgetApiFromWidgetAction.MSC3973UserDirectorySearch;
    data: IUserDirectorySearchFromWidgetRequestData;
}

export interface IUserDirectorySearchFromWidgetResponseData extends IWidgetApiResponseData {
    limited: boolean;
    results: Array<{
        user_id: string; // eslint-disable-line camelcase
        display_name?: string; // eslint-disable-line camelcase
        avatar_url?: string; // eslint-disable-line camelcase
    }>;
}

export interface IUserDirectorySearchFromWidgetActionResponse extends IUserDirectorySearchFromWidgetActionRequest {
    response: IUserDirectorySearchFromWidgetResponseData;
}

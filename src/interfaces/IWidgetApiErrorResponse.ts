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

import {
  IWidgetApiResponse,
  IWidgetApiResponseData,
} from "./IWidgetApiResponse";

/**
 * The format of errors returned by Matrix API requests
 * made by a WidgetDriver.
 */
export interface IMatrixApiError {
  /** The HTTP status code of the associated request. */
  http_status: number; // eslint-disable-line camelcase
  /** Any HTTP response headers that are relevant to the error. */
  http_headers: { [name: string]: string }; // eslint-disable-line camelcase
  /** The URL of the failed request. */
  url: string;
  /** @see {@link https://spec.matrix.org/latest/client-server-api/#standard-error-response} */
  response: {
    errcode: string;
    error: string;
  } & IWidgetApiResponseData; // extensible
}

export interface IWidgetApiErrorResponseDataDetails {
  /** Set if the error came from a Matrix API request made by a widget driver */
  matrix_api_error?: IMatrixApiError; // eslint-disable-line camelcase
}

export interface IWidgetApiErrorResponseData extends IWidgetApiResponseData {
  error: {
    /** A user-friendly string describing the error */
    message: string;
  } & IWidgetApiErrorResponseDataDetails;
}

export interface IWidgetApiErrorResponse extends IWidgetApiResponse {
  response: IWidgetApiErrorResponseData;
}

export function isErrorResponse(
  responseData: IWidgetApiResponseData,
): responseData is IWidgetApiErrorResponseData {
  const error = responseData.error;
  return (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  );
}

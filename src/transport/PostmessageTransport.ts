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

import { EventEmitter } from "events";

import { ITransport } from "./ITransport";
import {
  invertedDirection,
  isErrorResponse,
  IWidgetApiRequest,
  IWidgetApiRequestData,
  IWidgetApiResponse,
  IWidgetApiResponseData,
  WidgetApiResponseError,
  WidgetApiAction,
  WidgetApiDirection,
  WidgetApiToWidgetAction,
} from "..";

interface IOutboundRequest {
  request: IWidgetApiRequest;
  resolve: (response: IWidgetApiResponse) => void;
  reject: (err: Error) => void;
}

/**
 * Transport for the Widget API over postMessage.
 */
export class PostmessageTransport extends EventEmitter implements ITransport {
  public strictOriginCheck = false;
  public targetOrigin = "*";
  public timeoutSeconds = 10;

  private _ready = false;
  private _widgetId: string | null = null;
  private outboundRequests = new Map<string, IOutboundRequest | null>();
  private stopController = new AbortController();

  public get ready(): boolean {
    return this._ready;
  }

  public get widgetId(): string | null {
    return this._widgetId || null;
  }

  public constructor(
    private sendDirection: WidgetApiDirection,
    private initialWidgetId: string | null,
    private transportWindow: Window,
    private inboundWindow: Window,
  ) {
    super();
    this._widgetId = initialWidgetId;
  }

  private get nextRequestId(): string {
    const idBase = `widgetapi-${Date.now()}`;
    let index = 0;
    let id = idBase;
    while (this.outboundRequests.has(id)) {
      id = `${idBase}-${index++}`;
    }

    // reserve the ID
    this.outboundRequests.set(id, null);

    return id;
  }

  private sendInternal(message: IWidgetApiRequest | IWidgetApiResponse): void {
    console.log(
      `[PostmessageTransport] Sending object to ${this.targetOrigin}: `,
      message,
    );
    this.transportWindow.postMessage(message, this.targetOrigin);
  }

  public reply<T extends IWidgetApiResponseData>(
    request: IWidgetApiRequest,
    responseData: T,
  ): void {
    return this.sendInternal(<IWidgetApiResponse>{
      ...request,
      response: responseData,
    });
  }

  public send<
    T extends IWidgetApiRequestData,
    R extends IWidgetApiResponseData,
  >(action: WidgetApiAction, data: T): Promise<R> {
    return this.sendComplete(action, data).then((r) => <R>r.response);
  }

  public sendComplete<
    T extends IWidgetApiRequestData,
    R extends IWidgetApiResponse,
  >(action: WidgetApiAction, data: T): Promise<R> {
    if (!this.ready || !this.widgetId) {
      return Promise.reject(new Error("Not ready or unknown widget ID"));
    }
    const request: IWidgetApiRequest = {
      api: this.sendDirection,
      widgetId: this.widgetId,
      requestId: this.nextRequestId,
      action: action,
      data: data,
    };
    if (action === WidgetApiToWidgetAction.UpdateVisibility) {
      request["visible"] = data["visible"];
    }
    return new Promise<R>((prResolve, prReject) => {
      const resolve = (response: IWidgetApiResponse): void => {
        cleanUp();
        prResolve(<R>response);
      };
      const reject = (err: Error): void => {
        cleanUp();
        prReject(err);
      };

      const timerId = setTimeout(
        () => reject(new Error("Request timed out")),
        (this.timeoutSeconds || 1) * 1000,
      );

      const onStop = (): void => reject(new Error("Transport stopped"));
      this.stopController.signal.addEventListener("abort", onStop);

      const cleanUp = (): void => {
        this.outboundRequests.delete(request.requestId);
        clearTimeout(timerId);
        this.stopController.signal.removeEventListener("abort", onStop);
      };

      this.outboundRequests.set(request.requestId, {
        request,
        resolve,
        reject,
      });
      this.sendInternal(request);
    });
  }

  public start(): void {
    this.inboundWindow.addEventListener("message", (ev: MessageEvent) => {
      this.handleMessage(ev);
    });
    this._ready = true;
  }

  public stop(): void {
    this._ready = false;
    this.stopController.abort();
  }

  private handleMessage(ev: MessageEvent): void {
    if (this.stopController.signal.aborted) return;
    if (!ev.data) return; // invalid event

    if (this.strictOriginCheck && ev.origin !== window.origin) return; // bad origin

    // treat the message as a response first, then downgrade to a request
    const response = <IWidgetApiResponse>ev.data;
    if (!response.action || !response.requestId || !response.widgetId) return; // invalid request/response

    if (!response.response) {
      // it's a request
      const request = <IWidgetApiRequest>response;
      if (request.api !== invertedDirection(this.sendDirection)) return; // wrong direction
      this.handleRequest(request);
    } else {
      // it's a response
      if (response.api !== this.sendDirection) return; // wrong direction
      this.handleResponse(response);
    }
  }

  private handleRequest(request: IWidgetApiRequest): void {
    if (this.widgetId) {
      if (this.widgetId !== request.widgetId) return; // wrong widget
    } else {
      this._widgetId = request.widgetId;
    }

    this.emit("message", new CustomEvent("message", { detail: request }));
  }

  private handleResponse(response: IWidgetApiResponse): void {
    if (response.widgetId !== this.widgetId) return; // wrong widget

    const req = this.outboundRequests.get(response.requestId);
    if (!req) return; // response to an unknown request

    if (isErrorResponse(response.response)) {
      const { message, ...data } = response.response.error;
      req.reject(new WidgetApiResponseError(message, data));
    } else {
      req.resolve(response);
    }
  }
}

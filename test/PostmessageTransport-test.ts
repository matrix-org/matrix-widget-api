/*
 * Copyright 2025 The Matrix.org Foundation C.I.C.
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

import { PostmessageTransport, WidgetApiDirection, type IWidgetApiRequestData, invertedDirection } from "../src";

it("Should stop listening to window messages after being stopped", () => {
    // fake inbound window (supports addEventListener/removeEventListener/dispatchEvent)
    const inbound = new EventTarget();
    const originalAddEventListener = inbound.addEventListener.bind(inbound);

    let windowListener: EventListenerOrEventListenerObject | null = null;
    const addListenerSpy = jest.spyOn(inbound, "addEventListener").mockImplementation((type, listener) => {
        // call the listener directly when a message is dispatched
        windowListener = listener;
        originalAddEventListener(type, listener);
    });
    const removeListenerSpy = jest.spyOn(inbound, "removeEventListener");

    // stub transport window for postMessage calls
    const transportWin = { postMessage: jest.fn() } as unknown as Window;

    const transport = new PostmessageTransport(
        WidgetApiDirection.FromWidget,
        "widget-id",
        transportWin,
        inbound as unknown as Window,
    );

    let receivedCount = 0;
    transport.on("message", () => receivedCount++);

    transport.start();
    expect(addListenerSpy).toHaveBeenCalled();

    const request: IWidgetApiRequestData = {
        api: invertedDirection(WidgetApiDirection.FromWidget),
        action: "testAction",
        requestId: "req-1",
        widgetId: "widget-id",
        data: {},
    };

    inbound.dispatchEvent(new MessageEvent("message", { data: request }));
    expect(receivedCount).toBe(1);
    inbound.dispatchEvent(
        new MessageEvent("message", {
            data: {
                requestId: "req-2",
                ...request,
            },
        }),
    );
    expect(receivedCount).toBe(2);

    transport.stop();

    // dispatch again — handler should have been removed
    inbound.dispatchEvent(
        new MessageEvent("message", {
            data: {
                requestId: "req-3",
                ...request,
            },
        }),
    );
    expect(receivedCount).toBe(2);

    // Also verify removeEventListener was called, only looking for our listener
    // is not enough as the PostmessageTransport is checking against a `stopController` before
    // handling messages.
    expect(removeListenerSpy).toHaveBeenCalled();
    expect(removeListenerSpy).toHaveBeenCalledWith("message", windowListener);
});

/*
 * Copyright 2022 Nordeck IT + Consulting GmbH.
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

import { waitFor } from "@testing-library/dom";

import { ClientWidgetApi } from "../src/ClientWidgetApi";
import { WidgetDriver } from "../src/driver/WidgetDriver";
import { CurrentApiVersions, UnstableApiVersion } from "../src/interfaces/ApiVersion";
import { Capability, MatrixCapabilities } from "../src/interfaces/Capabilities";
import { IRoomEvent } from "../src/interfaces/IRoomEvent";
import { IWidgetApiRequest } from "../src/interfaces/IWidgetApiRequest";
import { IReadRelationsFromWidgetActionRequest } from "../src/interfaces/ReadRelationsAction";
import { ISupportedVersionsActionRequest } from "../src/interfaces/SupportedVersionsAction";
import { IUserDirectorySearchFromWidgetActionRequest } from "../src/interfaces/UserDirectorySearchAction";
import { WidgetApiFromWidgetAction, WidgetApiToWidgetAction } from "../src/interfaces/WidgetApiAction";
import { WidgetApiDirection } from "../src/interfaces/WidgetApiDirection";
import { Widget } from "../src/models/Widget";
import { PostmessageTransport } from "../src/transport/PostmessageTransport";
import {
    IDownloadFileActionFromWidgetActionRequest,
    IGetOpenIDActionRequest,
    IMatrixApiError,
    INavigateActionRequest,
    IReadEventFromWidgetActionRequest,
    ISendEventFromWidgetActionRequest,
    ISendToDeviceFromWidgetActionRequest,
    IUpdateDelayedEventFromWidgetActionRequest,
    IUploadFileActionFromWidgetActionRequest,
    IWidgetApiErrorResponseDataDetails,
    OpenIDRequestState,
    SimpleObservable,
    Symbols,
    UpdateDelayedEventAction,
} from "../src";
import { IGetMediaConfigActionFromWidgetActionRequest } from "../src/interfaces/GetMediaConfigAction";
import { IReadRoomAccountDataFromWidgetActionRequest } from "../src/interfaces/ReadRoomAccountDataAction";
import { IToDeviceMessage } from "../src/interfaces/IToDeviceMessage";

jest.mock("../src/transport/PostmessageTransport");

afterEach(() => {
    jest.resetAllMocks();
});

function createRoomEvent(event: Partial<IRoomEvent> = {}): IRoomEvent {
    return {
        type: "m.room.message",
        sender: "user-id",
        content: {},
        origin_server_ts: 0,
        event_id: "id-0",
        room_id: "!room-id",
        unsigned: {},
        ...event,
    };
}

class CustomMatrixError extends Error {
    public constructor(
        message: string,
        public readonly httpStatus: number,
        public readonly name: string,
        public readonly data: Record<string, unknown>,
    ) {
        super(message);
    }
}

function processCustomMatrixError(e: unknown): IWidgetApiErrorResponseDataDetails | undefined {
    return e instanceof CustomMatrixError
        ? {
              matrix_api_error: {
                  http_status: e.httpStatus,
                  http_headers: {},
                  url: "",
                  response: {
                      errcode: e.name,
                      error: e.message,
                      ...e.data,
                  },
              },
          }
        : undefined;
}

describe("ClientWidgetApi", () => {
    let capabilities: Capability[];
    let iframe: HTMLIFrameElement;
    let driver: jest.Mocked<WidgetDriver>;
    let clientWidgetApi: ClientWidgetApi;
    let transport: PostmessageTransport;
    let emitEvent: Parameters<PostmessageTransport["on"]>["1"];

    async function loadIframe(caps: Capability[] = []): Promise<void> {
        capabilities = caps;

        const ready = new Promise<void>((resolve) => {
            clientWidgetApi.once("ready", resolve);
        });

        iframe.dispatchEvent(new Event("load"));

        await ready;
    }

    beforeEach(() => {
        capabilities = [];
        iframe = document.createElement("iframe");
        document.body.appendChild(iframe);

        driver = {
            navigate: jest.fn(),
            readRoomTimeline: jest.fn(),
            readRoomState: jest.fn(() => Promise.resolve([])),
            readEventRelations: jest.fn(),
            sendEvent: jest.fn(),
            sendDelayedEvent: jest.fn(),
            cancelScheduledDelayedEvent: jest.fn(),
            restartScheduledDelayedEvent: jest.fn(),
            sendScheduledDelayedEvent: jest.fn(),
            sendToDevice: jest.fn(),
            askOpenID: jest.fn(),
            readRoomAccountData: jest.fn(),
            validateCapabilities: jest.fn(),
            searchUserDirectory: jest.fn(),
            getMediaConfig: jest.fn(),
            uploadFile: jest.fn(),
            downloadFile: jest.fn(),
            getKnownRooms: jest.fn(() => []),
            processError: jest.fn(),
            sendStickyEvent: jest.fn(),
            sendDelayedStickyEvent: jest.fn(),
        } as Partial<WidgetDriver> as jest.Mocked<WidgetDriver>;

        clientWidgetApi = new ClientWidgetApi(
            new Widget({
                id: "test",
                creatorUserId: "@alice:example.org",
                type: "example",
                url: "https://example.org",
            }),
            iframe,
            driver,
        );

        [transport] = jest.mocked(PostmessageTransport).mock.instances;
        emitEvent = jest.mocked(transport.on).mock.calls[0][1];

        jest.mocked(transport.send).mockResolvedValue({});
        jest.mocked(driver.validateCapabilities).mockImplementation(async () => new Set(capabilities));
    });

    afterEach(() => {
        clientWidgetApi.stop();
        iframe.remove();
    });

    it("should initiate capabilities", async () => {
        await loadIframe(["m.always_on_screen"]);

        expect(clientWidgetApi.hasCapability("m.always_on_screen")).toBe(true);
        expect(clientWidgetApi.hasCapability("m.sticker")).toBe(false);
    });

    describe("navigate action", () => {
        it("navigates", async () => {
            driver.navigate.mockResolvedValue(Promise.resolve());

            const event: INavigateActionRequest = {
                api: WidgetApiDirection.FromWidget,
                widgetId: "test",
                requestId: "0",
                action: WidgetApiFromWidgetAction.MSC2931Navigate,
                data: {
                    uri: "https://matrix.to/#/#room:example.net",
                },
            };

            await loadIframe(["org.matrix.msc2931.navigate"]);

            emitEvent(new CustomEvent("", { detail: event }));

            await waitFor(() => {
                expect(transport.reply).toHaveBeenCalledWith(event, {});
            });

            expect(driver.navigate).toHaveBeenCalledWith(event.data.uri);
        });

        it("fails to navigate", async () => {
            const event: INavigateActionRequest = {
                api: WidgetApiDirection.FromWidget,
                widgetId: "test",
                requestId: "0",
                action: WidgetApiFromWidgetAction.MSC2931Navigate,
                data: {
                    uri: "https://matrix.to/#/#room:example.net",
                },
            };

            await loadIframe([]); // Without the required capability

            emitEvent(new CustomEvent("", { detail: event }));

            await waitFor(() => {
                expect(transport.reply).toHaveBeenCalledWith(event, {
                    error: { message: "Missing capability" },
                });
            });

            expect(driver.navigate).not.toHaveBeenCalled();
        });

        it("fails to navigate to an unsupported URI", async () => {
            const event: INavigateActionRequest = {
                api: WidgetApiDirection.FromWidget,
                widgetId: "test",
                requestId: "0",
                action: WidgetApiFromWidgetAction.MSC2931Navigate,
                data: {
                    uri: "https://example.net",
                },
            };

            await loadIframe(["org.matrix.msc2931.navigate"]);

            emitEvent(new CustomEvent("", { detail: event }));

            await waitFor(() => {
                expect(transport.reply).toHaveBeenCalledWith(event, {
                    error: { message: "Invalid matrix.to URI" },
                });
            });

            expect(driver.navigate).not.toHaveBeenCalled();
        });

        it("should reject requests when the driver throws an exception", async () => {
            driver.navigate.mockRejectedValue(new Error("M_UNKNOWN: Unknown error"));

            const event: INavigateActionRequest = {
                api: WidgetApiDirection.FromWidget,
                widgetId: "test",
                requestId: "0",
                action: WidgetApiFromWidgetAction.MSC2931Navigate,
                data: {
                    uri: "https://matrix.to/#/#room:example.net",
                },
            };

            await loadIframe(["org.matrix.msc2931.navigate"]);

            emitEvent(new CustomEvent("", { detail: event }));

            await waitFor(() => {
                expect(transport.reply).toHaveBeenCalledWith(event, {
                    error: { message: "Error handling navigation" },
                });
            });
        });

        it("should reject with Matrix API error response thrown by driver", async () => {
            driver.processError.mockImplementation(processCustomMatrixError);

            driver.navigate.mockRejectedValue(
                new CustomMatrixError("failed to navigate", 400, "M_UNKNOWN", {
                    reason: "Unknown error",
                }),
            );

            const event: INavigateActionRequest = {
                api: WidgetApiDirection.FromWidget,
                widgetId: "test",
                requestId: "0",
                action: WidgetApiFromWidgetAction.MSC2931Navigate,
                data: {
                    uri: "https://matrix.to/#/#room:example.net",
                },
            };

            await loadIframe(["org.matrix.msc2931.navigate"]);

            emitEvent(new CustomEvent("", { detail: event }));

            await waitFor(() => {
                expect(transport.reply).toHaveBeenCalledWith(event, {
                    error: {
                        message: "Error handling navigation",
                        matrix_api_error: {
                            http_status: 400,
                            http_headers: {},
                            url: "",
                            response: {
                                errcode: "M_UNKNOWN",
                                error: "failed to navigate",
                                reason: "Unknown error",
                            },
                        } satisfies IMatrixApiError,
                    },
                });
            });
        });
    });

    describe("send_event action", () => {
        it("sends message events", async () => {
            const roomId = "!room:example.org";
            const eventId = "$event:example.org";

            driver.sendEvent.mockResolvedValue({
                roomId,
                eventId,
            });

            const event: ISendEventFromWidgetActionRequest = {
                api: WidgetApiDirection.FromWidget,
                widgetId: "test",
                requestId: "0",
                action: WidgetApiFromWidgetAction.SendEvent,
                data: {
                    type: "m.room.message",
                    content: {},
                    room_id: roomId,
                },
            };

            await loadIframe([
                `org.matrix.msc2762.timeline:${event.data.room_id}`,
                `org.matrix.msc2762.send.event:${event.data.type}`,
            ]);

            emitEvent(new CustomEvent("", { detail: event }));

            await waitFor(() => {
                expect(transport.reply).toHaveBeenCalledWith(event, {
                    room_id: roomId,
                    event_id: eventId,
                });
            });

            expect(driver.sendEvent).toHaveBeenCalledWith(event.data.type, event.data.content, null, roomId);
        });

        it("sends state events", async () => {
            const roomId = "!room:example.org";
            const eventId = "$event:example.org";

            driver.sendEvent.mockResolvedValue({
                roomId,
                eventId,
            });

            const event: ISendEventFromWidgetActionRequest = {
                api: WidgetApiDirection.FromWidget,
                widgetId: "test",
                requestId: "0",
                action: WidgetApiFromWidgetAction.SendEvent,
                data: {
                    type: "m.room.topic",
                    content: {},
                    state_key: "",
                    room_id: roomId,
                },
            };

            await loadIframe([
                `org.matrix.msc2762.timeline:${event.data.room_id}`,
                `org.matrix.msc2762.send.state_event:${event.data.type}`,
            ]);

            emitEvent(new CustomEvent("", { detail: event }));

            await waitFor(() => {
                expect(transport.reply).toHaveBeenCalledWith(event, {
                    room_id: roomId,
                    event_id: eventId,
                });
            });

            expect(driver.sendEvent).toHaveBeenCalledWith(event.data.type, event.data.content, "", roomId);
        });

        it("should reject requests when the driver throws an exception", async () => {
            const roomId = "!room:example.org";

            driver.sendEvent.mockRejectedValue(new Error("M_BAD_JSON: Content must be a JSON object"));

            const event: ISendEventFromWidgetActionRequest = {
                api: WidgetApiDirection.FromWidget,
                widgetId: "test",
                requestId: "0",
                action: WidgetApiFromWidgetAction.SendEvent,
                data: {
                    type: "m.room.message",
                    content: "hello",
                    room_id: roomId,
                },
            };

            await loadIframe([
                `org.matrix.msc2762.timeline:${event.data.room_id}`,
                `org.matrix.msc2762.send.event:${event.data.type}`,
            ]);

            emitEvent(new CustomEvent("", { detail: event }));

            await waitFor(() => {
                expect(transport.reply).toHaveBeenCalledWith(event, {
                    error: { message: "Error sending event" },
                });
            });
        });

        it("should reject with Matrix API error response thrown by driver", async () => {
            const roomId = "!room:example.org";

            driver.processError.mockImplementation(processCustomMatrixError);

            driver.sendEvent.mockRejectedValue(
                new CustomMatrixError("failed to send event", 400, "M_NOT_JSON", {
                    reason: "Content must be a JSON object.",
                }),
            );

            const event: ISendEventFromWidgetActionRequest = {
                api: WidgetApiDirection.FromWidget,
                widgetId: "test",
                requestId: "0",
                action: WidgetApiFromWidgetAction.SendEvent,
                data: {
                    type: "m.room.message",
                    content: "hello",
                    room_id: roomId,
                },
            };

            await loadIframe([
                `org.matrix.msc2762.timeline:${event.data.room_id}`,
                `org.matrix.msc2762.send.event:${event.data.type}`,
            ]);

            emitEvent(new CustomEvent("", { detail: event }));

            await waitFor(() => {
                expect(transport.reply).toHaveBeenCalledWith(event, {
                    error: {
                        message: "Error sending event",
                        matrix_api_error: {
                            http_status: 400,
                            http_headers: {},
                            url: "",
                            response: {
                                errcode: "M_NOT_JSON",
                                error: "failed to send event",
                                reason: "Content must be a JSON object.",
                            },
                        } satisfies IMatrixApiError,
                    },
                });
            });
        });
    });

    describe("send_event action for delayed events", () => {
        it("fails to send delayed events", async () => {
            const roomId = "!room:example.org";

            const event: ISendEventFromWidgetActionRequest = {
                api: WidgetApiDirection.FromWidget,
                widgetId: "test",
                requestId: "0",
                action: WidgetApiFromWidgetAction.SendEvent,
                data: {
                    type: "m.room.message",
                    content: {},
                    delay: 5000,
                    room_id: roomId,
                },
            };

            await loadIframe([
                `org.matrix.msc2762.timeline:${event.data.room_id}`,
                `org.matrix.msc2762.send.event:${event.data.type}`,
                // Without the required capability
            ]);

            emitEvent(new CustomEvent("", { detail: event }));

            await waitFor(() => {
                expect(transport.reply).toHaveBeenCalledWith(event, {
                    error: { message: expect.any(String) },
                });
            });

            expect(driver.sendDelayedEvent).not.toHaveBeenCalled();
        });

        it.each([
            { hasDelay: true, hasParent: false },
            { hasDelay: false, hasParent: true },
            { hasDelay: true, hasParent: true },
        ])(
            "sends delayed message events (hasDelay = $hasDelay, hasParent = $hasParent)",
            async ({ hasDelay, hasParent }) => {
                const roomId = "!room:example.org";
                const timeoutDelayId = "ft";

                driver.sendDelayedEvent.mockResolvedValue({
                    roomId,
                    delayId: timeoutDelayId,
                });

                const event: ISendEventFromWidgetActionRequest = {
                    api: WidgetApiDirection.FromWidget,
                    widgetId: "test",
                    requestId: "0",
                    action: WidgetApiFromWidgetAction.SendEvent,
                    data: {
                        type: "m.room.message",
                        content: {},
                        room_id: roomId,
                        ...(hasDelay && { delay: 5000 }),
                        ...(hasParent && { parent_delay_id: "fp" }),
                    },
                };

                await loadIframe([
                    `org.matrix.msc2762.timeline:${event.data.room_id}`,
                    `org.matrix.msc2762.send.event:${event.data.type}`,
                    "org.matrix.msc4157.send.delayed_event",
                ]);

                emitEvent(new CustomEvent("", { detail: event }));

                await waitFor(() => {
                    expect(transport.reply).toHaveBeenCalledWith(event, {
                        room_id: roomId,
                        delay_id: timeoutDelayId,
                    });
                });

                expect(driver.sendDelayedEvent).toHaveBeenCalledWith(
                    event.data.delay ?? null,
                    event.data.parent_delay_id ?? null,
                    event.data.type,
                    event.data.content,
                    null,
                    roomId,
                );
            },
        );

        it.each([
            { hasDelay: true, hasParent: false },
            { hasDelay: false, hasParent: true },
            { hasDelay: true, hasParent: true },
        ])(
            "sends delayed state events (hasDelay = $hasDelay, hasParent = $hasParent)",
            async ({ hasDelay, hasParent }) => {
                const roomId = "!room:example.org";
                const timeoutDelayId = "ft";

                driver.sendDelayedEvent.mockResolvedValue({
                    roomId,
                    delayId: timeoutDelayId,
                });

                const event: ISendEventFromWidgetActionRequest = {
                    api: WidgetApiDirection.FromWidget,
                    widgetId: "test",
                    requestId: "0",
                    action: WidgetApiFromWidgetAction.SendEvent,
                    data: {
                        type: "m.room.topic",
                        content: {},
                        state_key: "",
                        room_id: roomId,
                        ...(hasDelay && { delay: 5000 }),
                        ...(hasParent && { parent_delay_id: "fp" }),
                    },
                };

                await loadIframe([
                    `org.matrix.msc2762.timeline:${event.data.room_id}`,
                    `org.matrix.msc2762.send.state_event:${event.data.type}`,
                    "org.matrix.msc4157.send.delayed_event",
                ]);

                emitEvent(new CustomEvent("", { detail: event }));

                await waitFor(() => {
                    expect(transport.reply).toHaveBeenCalledWith(event, {
                        room_id: roomId,
                        delay_id: timeoutDelayId,
                    });
                });

                expect(driver.sendDelayedEvent).toHaveBeenCalledWith(
                    event.data.delay ?? null,
                    event.data.parent_delay_id ?? null,
                    event.data.type,
                    event.data.content,
                    "",
                    roomId,
                );
            },
        );

        it("should reject requests when the driver throws an exception", async () => {
            const roomId = "!room:example.org";

            driver.sendDelayedEvent.mockRejectedValue(new Error("M_BAD_JSON: Content must be a JSON object"));

            const event: ISendEventFromWidgetActionRequest = {
                api: WidgetApiDirection.FromWidget,
                widgetId: "test",
                requestId: "0",
                action: WidgetApiFromWidgetAction.SendEvent,
                data: {
                    type: "m.room.message",
                    content: "hello",
                    room_id: roomId,
                    delay: 5000,
                    parent_delay_id: "fp",
                },
            };

            await loadIframe([
                `org.matrix.msc2762.timeline:${event.data.room_id}`,
                `org.matrix.msc2762.send.event:${event.data.type}`,
                "org.matrix.msc4157.send.delayed_event",
            ]);

            emitEvent(new CustomEvent("", { detail: event }));

            await waitFor(() => {
                expect(transport.reply).toHaveBeenCalledWith(event, {
                    error: { message: "Error sending event" },
                });
            });
        });

        it("should reject with Matrix API error response thrown by driver", async () => {
            const roomId = "!room:example.org";

            driver.processError.mockImplementation(processCustomMatrixError);

            driver.sendDelayedEvent.mockRejectedValue(
                new CustomMatrixError("failed to send event", 400, "M_NOT_JSON", {
                    reason: "Content must be a JSON object.",
                }),
            );

            const event: ISendEventFromWidgetActionRequest = {
                api: WidgetApiDirection.FromWidget,
                widgetId: "test",
                requestId: "0",
                action: WidgetApiFromWidgetAction.SendEvent,
                data: {
                    type: "m.room.message",
                    content: "hello",
                    room_id: roomId,
                    delay: 5000,
                    parent_delay_id: "fp",
                },
            };

            await loadIframe([
                `org.matrix.msc2762.timeline:${event.data.room_id}`,
                `org.matrix.msc2762.send.event:${event.data.type}`,
                "org.matrix.msc4157.send.delayed_event",
            ]);

            emitEvent(new CustomEvent("", { detail: event }));

            await waitFor(() => {
                expect(transport.reply).toHaveBeenCalledWith(event, {
                    error: {
                        message: "Error sending event",
                        matrix_api_error: {
                            http_status: 400,
                            http_headers: {},
                            url: "",
                            response: {
                                errcode: "M_NOT_JSON",
                                error: "failed to send event",
                                reason: "Content must be a JSON object.",
                            },
                        } satisfies IMatrixApiError,
                    },
                });
            });
        });
    });

    describe("send_event action for sticky events", () => {
        it("fails to send delayed events", async () => {
            const roomId = "!room:example.org";

            const event: ISendEventFromWidgetActionRequest = {
                api: WidgetApiDirection.FromWidget,
                widgetId: "test",
                requestId: "0",
                action: WidgetApiFromWidgetAction.SendEvent,
                data: {
                    type: "m.room.message",
                    content: {
                        sticky_key: "foobar",
                    },
                    delay: 5000,
                    room_id: roomId,
                    sticky_duration_ms: 5000,
                },
            };

            await loadIframe([
                `org.matrix.msc2762.timeline:${event.data.room_id}`,
                `org.matrix.msc2762.send.event:${event.data.type}`,
                // Without the required capability
            ]);

            emitEvent(new CustomEvent("", { detail: event }));

            await waitFor(() => {
                expect(transport.reply).toHaveBeenCalledWith(event, {
                    error: { message: expect.any(String) },
                });
            });

            expect(driver.sendDelayedEvent).not.toHaveBeenCalled();
        });

        it("can send a sticky message event", async () => {
            const roomId = "!room:example.org";
            const eventId = "$evt:example.org";

            driver.sendStickyEvent.mockResolvedValue({
                roomId,
                eventId,
            });

            const event: ISendEventFromWidgetActionRequest = {
                api: WidgetApiDirection.FromWidget,
                widgetId: "test",
                requestId: "0",
                action: WidgetApiFromWidgetAction.SendEvent,
                data: {
                    type: "m.room.message",
                    content: {
                        sticky_key: "12345",
                    },
                    room_id: roomId,
                    sticky_duration_ms: 5000,
                },
            };

            await loadIframe([
                `org.matrix.msc2762.timeline:${event.data.room_id}`,
                `org.matrix.msc2762.send.event:${event.data.type}`,
                MatrixCapabilities.MSC4407SendStickyEvent,
            ]);

            emitEvent(new CustomEvent("", { detail: event }));

            await waitFor(() => {
                expect(transport.reply).toHaveBeenCalledWith(event, {
                    room_id: roomId,
                    event_id: eventId,
                });
            });

            expect(driver.sendStickyEvent).toHaveBeenCalledWith(5000, event.data.type, event.data.content, roomId);
        });

        it.each([
            { hasDelay: true, hasParent: false },
            { hasDelay: false, hasParent: true },
            { hasDelay: true, hasParent: true },
        ])(
            "sends sticky message events with a delay (withDelay = $hasDelay, hasParent = $hasParent)",
            async ({ hasDelay, hasParent }) => {
                const roomId = "!room:example.org";
                const timeoutDelayId = "ft";

                driver.sendDelayedStickyEvent.mockResolvedValue({
                    roomId,
                    delayId: timeoutDelayId,
                });

                const event: ISendEventFromWidgetActionRequest = {
                    api: WidgetApiDirection.FromWidget,
                    widgetId: "test",
                    requestId: "0",
                    action: WidgetApiFromWidgetAction.SendEvent,
                    data: {
                        type: "m.room.message",
                        content: {
                            sticky_key: "12345",
                        },
                        room_id: roomId,
                        ...(hasDelay && { delay: 5000 }),
                        ...(hasParent && { parent_delay_id: "fp" }),
                        sticky_duration_ms: 5000,
                    },
                };

                await loadIframe([
                    `org.matrix.msc2762.timeline:${event.data.room_id}`,
                    `org.matrix.msc2762.send.event:${event.data.type}`,
                    MatrixCapabilities.MSC4157SendDelayedEvent,
                    MatrixCapabilities.MSC4407SendStickyEvent,
                ]);

                emitEvent(new CustomEvent("", { detail: event }));

                await waitFor(() => {
                    expect(transport.reply).toHaveBeenCalledWith(event, {
                        room_id: roomId,
                        delay_id: timeoutDelayId,
                    });
                });

                expect(driver.sendDelayedStickyEvent).toHaveBeenCalledWith(
                    event.data.delay ?? null,
                    event.data.parent_delay_id ?? null,
                    5000,
                    event.data.type,
                    event.data.content,
                    roomId,
                );
            },
        );

        it("does not allow sticky state events", async () => {
            const roomId = "!room:example.org";
            const timeoutDelayId = "ft";

            driver.sendDelayedEvent.mockResolvedValue({
                roomId,
                delayId: timeoutDelayId,
            });

            const event: ISendEventFromWidgetActionRequest = {
                api: WidgetApiDirection.FromWidget,
                widgetId: "test",
                requestId: "0",
                action: WidgetApiFromWidgetAction.SendEvent,
                data: {
                    type: "m.room.topic",
                    content: {},
                    state_key: "",
                    room_id: roomId,
                    sticky_duration_ms: 5000,
                },
            };

            await loadIframe([
                `org.matrix.msc2762.timeline:${event.data.room_id}`,
                `org.matrix.msc2762.send.state_event:${event.data.type}`,
                MatrixCapabilities.MSC4407SendStickyEvent,
            ]);

            emitEvent(new CustomEvent("", { detail: event }));

            await waitFor(() => {
                expect(transport.reply).toHaveBeenCalledWith(event, {
                    error: { message: "Cannot send a state event with a sticky duration" },
                });
            });
        });
    });

    describe("Sticky events updates", () => {
        // Some testing contants for sticky events
        const ROOM_A = "!here:example.org";
        const ROOM_B = "!there:example.org";

        const ALICE_RTC_MEMBER_EVENT = createRoomEvent({
            sender: "@alice:example.org",
            room_id: ROOM_A,
            type: "org.matrix.msc4143.rtc.member",
            content: {
                member: {
                    device_id: "HXKHKJSLZI",
                },
                msc4354_sticky_key: "001",
            },
        });

        const BOB_RTC_MEMBER_EVENT = createRoomEvent({
            sender: "@bob:example.org",
            room_id: ROOM_A,
            type: "org.matrix.msc4143.rtc.member",
            content: {
                msc4354_sticky_key: "002",
            },
        });

        const ANOTHER_STICKY_EVENT = createRoomEvent({
            type: "org.example.active_poll",
            room_id: ROOM_A,
            content: {
                q: "How are you?",
                options: ["Good", "Bad", "Okay"],
                msc4354_sticky_key: "ac_000",
            },
        });

        const OTHER_ROOM_RTC_EVENT = {
            ...ALICE_RTC_MEMBER_EVENT,
            room_id: ROOM_B,
        };

        beforeEach(() => {
            driver.readStickyEvents = jest.fn().mockImplementation((roomId) => {
                if (roomId === ROOM_A) {
                    return Promise.resolve([ALICE_RTC_MEMBER_EVENT, BOB_RTC_MEMBER_EVENT, ANOTHER_STICKY_EVENT]);
                } else if (roomId === ROOM_B) {
                    return Promise.resolve([OTHER_ROOM_RTC_EVENT]);
                }
                return Promise.resolve([]);
            });
        });

        it("Feed current sticky events to the widget when loaded", async () => {
            // Load
            await loadIframe([
                `org.matrix.msc2762.timeline:${ROOM_A}`,
                "org.matrix.msc2762.receive.event:org.matrix.msc4143.rtc.member",
                MatrixCapabilities.MSC4407ReceiveStickyEvent,
            ]);

            await waitFor(() => {
                expect(transport.send).toHaveBeenCalledWith(WidgetApiToWidgetAction.SendEvent, ALICE_RTC_MEMBER_EVENT);
                expect(transport.send).toHaveBeenCalledWith(WidgetApiToWidgetAction.SendEvent, BOB_RTC_MEMBER_EVENT);
            });
        });

        it("Feed current sticky events to the widget when loaded room B", async () => {
            // Load
            await loadIframe([
                `org.matrix.msc2762.timeline:${ROOM_B}`,
                "org.matrix.msc2762.receive.event:org.matrix.msc4143.rtc.member",
                MatrixCapabilities.MSC4407ReceiveStickyEvent,
            ]);

            await waitFor(() => {
                expect(transport.send).toHaveBeenCalledWith(WidgetApiToWidgetAction.SendEvent, OTHER_ROOM_RTC_EVENT);
                expect(transport.send).not.toHaveBeenCalledWith(
                    WidgetApiToWidgetAction.SendEvent,
                    ALICE_RTC_MEMBER_EVENT,
                );
            });
        });

        it("Should not push sticky events of type that the widget cannot receive", async () => {
            // Load
            await loadIframe([
                `org.matrix.msc2762.timeline:${ROOM_A}`,
                "org.matrix.msc2762.receive.event:org.matrix.msc4143.rtc.member",
                MatrixCapabilities.MSC4407ReceiveStickyEvent,
            ]);

            // -- ASSERT
            // The sticky events of the unrequested type should not be pushed
            await waitFor(() => {
                expect(transport.send).toHaveBeenCalledWith(WidgetApiToWidgetAction.SendEvent, ALICE_RTC_MEMBER_EVENT);
                expect(transport.send).toHaveBeenCalledWith(WidgetApiToWidgetAction.SendEvent, BOB_RTC_MEMBER_EVENT);
                expect(transport.send).not.toHaveBeenCalledWith(
                    WidgetApiToWidgetAction.SendEvent,
                    ANOTHER_STICKY_EVENT,
                );
            });
        });

        it("Should not push sticky events from another room", async () => {
            // Load
            await loadIframe([
                `org.matrix.msc2762.timeline:${ROOM_A}`,
                "org.matrix.msc2762.receive.event:org.matrix.msc4143.rtc.member",
                MatrixCapabilities.MSC4407ReceiveStickyEvent,
            ]);

            // -- ASSERT
            // The sticky events of the unrequested type should not be pushed
            await waitFor(() => {
                expect(transport.send).toHaveBeenCalledWith(WidgetApiToWidgetAction.SendEvent, ALICE_RTC_MEMBER_EVENT);
                expect(transport.send).toHaveBeenCalledWith(WidgetApiToWidgetAction.SendEvent, BOB_RTC_MEMBER_EVENT);
                expect(transport.send).not.toHaveBeenCalledWith(
                    WidgetApiToWidgetAction.SendEvent,
                    OTHER_ROOM_RTC_EVENT,
                );
            });
        });

        it("Should not push past sticky event if sticky capability not requested", async () => {
            // -- ACT
            // Request permission to read `org.matrix.msc4143.rtc.member` but without
            // the permission to read sticky events
            await loadIframe([
                `org.matrix.msc2762.timeline:${ROOM_A}`,
                "org.matrix.msc2762.receive.event:org.matrix.msc4143.rtc.member",
            ]);

            // -- ASSERT
            // No sticky events should be pushed!
            await waitFor(() => {
                expect(transport.send).not.toHaveBeenCalledWith(WidgetApiToWidgetAction.SendEvent, expect.anything());
            });
        });
    });

    describe("receiving events", () => {
        const roomId = "!room:example.org";
        const otherRoomId = "!other-room:example.org";
        const event = createRoomEvent({ room_id: roomId, type: "m.room.message", content: { hello: "there" } });
        const eventFromOtherRoom = createRoomEvent({
            room_id: otherRoomId,
            type: "m.room.message",
            content: { test: "test" },
        });

        it("forwards events to the widget from one room only", async () => {
            // Give the widget capabilities to receive from just one room
            await loadIframe([
                `org.matrix.msc2762.timeline:${roomId}`,
                "org.matrix.msc2762.receive.event:m.room.message",
            ]);

            // Event from the matching room should be forwarded
            clientWidgetApi.feedEvent(event);
            expect(transport.send).toHaveBeenCalledWith(WidgetApiToWidgetAction.SendEvent, event);

            // Event from the other room should not be forwarded
            clientWidgetApi.feedEvent(eventFromOtherRoom);
            expect(transport.send).not.toHaveBeenCalledWith(WidgetApiToWidgetAction.SendEvent, eventFromOtherRoom);
        });

        it("forwards events to the widget from the currently viewed room", async () => {
            clientWidgetApi.setViewedRoomId(roomId);
            // Give the widget capabilities to receive events without specifying
            // any rooms that it can read
            await loadIframe([
                `org.matrix.msc2762.timeline:${roomId}`,
                "org.matrix.msc2762.receive.event:m.room.message",
            ]);

            // Event from the viewed room should be forwarded
            clientWidgetApi.feedEvent(event);
            expect(transport.send).toHaveBeenCalledWith(WidgetApiToWidgetAction.SendEvent, event);

            // Event from the other room should not be forwarded
            clientWidgetApi.feedEvent(eventFromOtherRoom);
            expect(transport.send).not.toHaveBeenCalledWith(WidgetApiToWidgetAction.SendEvent, eventFromOtherRoom);

            // View the other room; now the event can be forwarded
            clientWidgetApi.setViewedRoomId(otherRoomId);
            clientWidgetApi.feedEvent(eventFromOtherRoom);
            expect(transport.send).toHaveBeenCalledWith(WidgetApiToWidgetAction.SendEvent, eventFromOtherRoom);
        });

        it("forwards events to the widget from all rooms", async () => {
            // Give the widget capabilities to receive from any known room
            await loadIframe([
                `org.matrix.msc2762.timeline:${Symbols.AnyRoom}`,
                "org.matrix.msc2762.receive.event:m.room.message",
            ]);

            // Events from both rooms should be forwarded
            clientWidgetApi.feedEvent(event);
            clientWidgetApi.feedEvent(eventFromOtherRoom);
            expect(transport.send).toHaveBeenCalledWith(WidgetApiToWidgetAction.SendEvent, event);
            expect(transport.send).toHaveBeenCalledWith(WidgetApiToWidgetAction.SendEvent, eventFromOtherRoom);
        });
    });

    describe("receiving room state", () => {
        it("syncs initial state and feeds updates", async () => {
            const roomId = "!room:example.org";
            const otherRoomId = "!other-room:example.org";
            clientWidgetApi.setViewedRoomId(roomId);

            jest.spyOn(transport, "send").mockImplementation((action, data) => {
                if (action === WidgetApiToWidgetAction.SupportedApiVersions) {
                    return Promise.resolve({ supported_versions: CurrentApiVersions });
                }
                return Promise.resolve({});
            });

            const topicEvent = createRoomEvent({
                room_id: roomId,
                type: "m.room.topic",
                state_key: "",
                content: { topic: "Hello world!" },
            });
            const nameEvent = createRoomEvent({
                room_id: roomId,
                type: "m.room.name",
                state_key: "",
                content: { name: "Test room" },
            });
            const joinRulesEvent = createRoomEvent({
                room_id: roomId,
                type: "m.room.join_rules",
                state_key: "",
                content: { join_rule: "public" },
            });
            const otherRoomNameEvent = createRoomEvent({
                room_id: otherRoomId,
                type: "m.room.name",
                state_key: "",
                content: { name: "Other room" },
            });

            // Artificially delay the delivery of the join rules event
            let resolveJoinRules: () => void;
            const joinRules = new Promise<void>((resolve) => (resolveJoinRules = resolve));

            driver.readRoomState.mockImplementation(async (rId, eventType, stateKey) => {
                if (rId === roomId) {
                    if (eventType === "m.room.topic" && stateKey === "") return [topicEvent];
                    if (eventType === "m.room.name" && stateKey === "") return [nameEvent];
                    if (eventType === "m.room.join_rules" && stateKey === "") {
                        await joinRules;
                        return [joinRulesEvent];
                    }
                } else if (rId === otherRoomId) {
                    if (eventType === "m.room.name" && stateKey === "") return [otherRoomNameEvent];
                }
                return [];
            });

            await loadIframe([
                "org.matrix.msc2762.receive.state_event:m.room.topic#",
                "org.matrix.msc2762.receive.state_event:m.room.name#",
                "org.matrix.msc2762.receive.state_event:m.room.join_rules#",
            ]);

            // Simulate a race between reading the original join rules event and
            // the join rules being updated at the same time
            const newJoinRulesEvent = createRoomEvent({
                room_id: roomId,
                type: "m.room.join_rules",
                state_key: "",
                content: { join_rule: "invite" },
            });
            clientWidgetApi.feedStateUpdate(newJoinRulesEvent);
            // What happens if the original join rules are delivered after the
            // updated ones?
            resolveJoinRules!();

            await waitFor(() => {
                // The initial topic and name should have been pushed
                expect(transport.send).toHaveBeenCalledWith(WidgetApiToWidgetAction.UpdateState, {
                    state: [topicEvent, nameEvent, newJoinRulesEvent],
                });
                // Only the updated join rules should have been delivered
                expect(transport.send).not.toHaveBeenCalledWith(WidgetApiToWidgetAction.UpdateState, {
                    state: expect.arrayContaining([joinRules]),
                });
            });

            // Check that further updates to room state are pushed to the widget
            // as expected
            const newTopicEvent = createRoomEvent({
                room_id: roomId,
                type: "m.room.topic",
                state_key: "",
                content: { topic: "Our new topic" },
            });
            clientWidgetApi.feedStateUpdate(newTopicEvent);

            await waitFor(() => {
                expect(transport.send).toHaveBeenCalledWith(WidgetApiToWidgetAction.UpdateState, {
                    state: [newTopicEvent],
                });
            });

            // Up to this point we should not have received any state for the
            // other (unviewed) room
            expect(transport.send).not.toHaveBeenCalledWith(WidgetApiToWidgetAction.UpdateState, {
                state: expect.arrayContaining([otherRoomNameEvent]),
            });
            // Now view the other room
            clientWidgetApi.setViewedRoomId(otherRoomId);
            (transport.send as unknown as jest.SpyInstance).mockClear();

            await waitFor(() => {
                // The state of the other room should now be pushed
                expect(transport.send).toHaveBeenCalledWith(WidgetApiToWidgetAction.UpdateState, {
                    state: expect.arrayContaining([otherRoomNameEvent]),
                });
            });
        });
    });

    describe("dont receive UpdateState if version not supported", () => {
        it("syncs initial state and feeds updates", async () => {
            const roomId = "!room:example.org";
            clientWidgetApi.setViewedRoomId(roomId);
            jest.spyOn(transport, "send").mockImplementation((action, data) => {
                if (action === WidgetApiToWidgetAction.SupportedApiVersions) {
                    return Promise.resolve({ supported_versions: [] });
                }
                return Promise.resolve({});
            });

            await loadIframe(["org.matrix.msc2762.receive.state_event:m.room.join_rules#"]);

            const newJoinRulesEvent = createRoomEvent({
                room_id: roomId,
                type: "m.room.join_rules",
                state_key: "",
                content: { join_rule: "invite" },
            });
            clientWidgetApi.feedStateUpdate(newJoinRulesEvent);

            await waitFor(() => {
                // Only the updated join rules should have been delivered
                expect(transport.send).not.toHaveBeenCalledWith(WidgetApiToWidgetAction.UpdateState);
            });
        });
    });

    describe("receiving to device messages", () => {
        it.each([true, false])("forwards device messages to the widget", async (encrypted) => {
            const event: IToDeviceMessage = {
                content: { foo: "bar" },
                type: "org.example.mytype",
                sender: "@alice:example.org",
            };
            // Give the widget capabilities to receive from just one room
            await loadIframe(["org.matrix.msc3819.receive.to_device:org.example.mytype"]);

            // Event from the matching room should be forwarded
            await clientWidgetApi.feedToDevice(event, encrypted);
            expect(transport.send).toHaveBeenCalledWith(WidgetApiToWidgetAction.SendToDevice, { ...event, encrypted });
        });
        it("ignores messages not allowed by capabilities", async () => {
            const event: IToDeviceMessage = {
                content: { foo: "bar" },
                type: "org.example.othertype",
                sender: "@alice:example.org",
            };
            // Give the widget capabilities to receive from just one room
            await loadIframe(["org.matrix.msc3819.receive.to_device:org.example.mytype"]);
            // Clear all prior messages.
            jest.mocked(transport.send).mockClear();
            // Event from the matching room should be forwarded
            await clientWidgetApi.feedToDevice(event, false);
            expect(transport.send).not.toHaveBeenCalled();
        });
    });

    describe("update_delayed_event action", () => {
        it("fails to cancel delayed events", async () => {
            const event: IUpdateDelayedEventFromWidgetActionRequest = {
                api: WidgetApiDirection.FromWidget,
                widgetId: "test",
                requestId: "0",
                action: WidgetApiFromWidgetAction.MSC4157UpdateDelayedEvent,
                data: {
                    delay_id: "f",
                    action: UpdateDelayedEventAction.Cancel,
                },
            };

            await loadIframe([]); // Without the required capability

            emitEvent(new CustomEvent("", { detail: event }));

            await waitFor(() => {
                expect(transport.reply).toHaveBeenCalledWith(event, {
                    error: { message: expect.any(String) },
                });
            });

            expect(driver.cancelScheduledDelayedEvent).not.toHaveBeenCalled();
        });

        it("fails to restart delayed events", async () => {
            const event: IUpdateDelayedEventFromWidgetActionRequest = {
                api: WidgetApiDirection.FromWidget,
                widgetId: "test",
                requestId: "0",
                action: WidgetApiFromWidgetAction.MSC4157UpdateDelayedEvent,
                data: {
                    delay_id: "f",
                    action: UpdateDelayedEventAction.Restart,
                },
            };

            await loadIframe([]); // Without the required capability

            emitEvent(new CustomEvent("", { detail: event }));

            await waitFor(() => {
                expect(transport.reply).toHaveBeenCalledWith(event, {
                    error: { message: expect.any(String) },
                });
            });

            expect(driver.restartScheduledDelayedEvent).not.toHaveBeenCalled();
        });

        it("fails to send delayed events", async () => {
            const event: IUpdateDelayedEventFromWidgetActionRequest = {
                api: WidgetApiDirection.FromWidget,
                widgetId: "test",
                requestId: "0",
                action: WidgetApiFromWidgetAction.MSC4157UpdateDelayedEvent,
                data: {
                    delay_id: "f",
                    action: UpdateDelayedEventAction.Send,
                },
            };

            await loadIframe([]); // Without the required capability

            emitEvent(new CustomEvent("", { detail: event }));

            await waitFor(() => {
                expect(transport.reply).toHaveBeenCalledWith(event, {
                    error: { message: expect.any(String) },
                });
            });

            expect(driver.sendScheduledDelayedEvent).not.toHaveBeenCalled();
        });

        it("fails to update delayed events with unsupported action", async () => {
            const event: IUpdateDelayedEventFromWidgetActionRequest = {
                api: WidgetApiDirection.FromWidget,
                widgetId: "test",
                requestId: "0",
                action: WidgetApiFromWidgetAction.MSC4157UpdateDelayedEvent,
                data: {
                    delay_id: "f",
                    action: "unknown" as UpdateDelayedEventAction,
                },
            };

            await loadIframe(["org.matrix.msc4157.update_delayed_event"]);

            emitEvent(new CustomEvent("", { detail: event }));

            await waitFor(() => {
                expect(transport.reply).toHaveBeenCalledWith(event, {
                    error: { message: expect.any(String) },
                });
            });

            expect(driver.cancelScheduledDelayedEvent).not.toHaveBeenCalled();
            expect(driver.restartScheduledDelayedEvent).not.toHaveBeenCalled();
            expect(driver.sendScheduledDelayedEvent).not.toHaveBeenCalled();
        });

        it("can cancel delayed events", async () => {
            driver.cancelScheduledDelayedEvent.mockResolvedValue(undefined);

            const event: IUpdateDelayedEventFromWidgetActionRequest = {
                api: WidgetApiDirection.FromWidget,
                widgetId: "test",
                requestId: "0",
                action: WidgetApiFromWidgetAction.MSC4157UpdateDelayedEvent,
                data: {
                    delay_id: "f",
                    action: UpdateDelayedEventAction.Cancel,
                },
            };

            await loadIframe(["org.matrix.msc4157.update_delayed_event"]);

            emitEvent(new CustomEvent("", { detail: event }));

            await waitFor(() => {
                expect(transport.reply).toHaveBeenCalledWith(event, {});
            });

            expect(driver.cancelScheduledDelayedEvent).toHaveBeenCalledWith(event.data.delay_id);
        });

        it("can restart delayed events", async () => {
            driver.restartScheduledDelayedEvent.mockResolvedValue(undefined);

            const event: IUpdateDelayedEventFromWidgetActionRequest = {
                api: WidgetApiDirection.FromWidget,
                widgetId: "test",
                requestId: "0",
                action: WidgetApiFromWidgetAction.MSC4157UpdateDelayedEvent,
                data: {
                    delay_id: "f",
                    action: UpdateDelayedEventAction.Restart,
                },
            };

            await loadIframe(["org.matrix.msc4157.update_delayed_event"]);

            emitEvent(new CustomEvent("", { detail: event }));

            await waitFor(() => {
                expect(transport.reply).toHaveBeenCalledWith(event, {});
            });

            expect(driver.restartScheduledDelayedEvent).toHaveBeenCalledWith(event.data.delay_id);
        });

        it("can send delayed events", async () => {
            driver.sendScheduledDelayedEvent.mockResolvedValue(undefined);

            const event: IUpdateDelayedEventFromWidgetActionRequest = {
                api: WidgetApiDirection.FromWidget,
                widgetId: "test",
                requestId: "0",
                action: WidgetApiFromWidgetAction.MSC4157UpdateDelayedEvent,
                data: {
                    delay_id: "f",
                    action: UpdateDelayedEventAction.Send,
                },
            };

            await loadIframe(["org.matrix.msc4157.update_delayed_event"]);

            emitEvent(new CustomEvent("", { detail: event }));

            await waitFor(() => {
                expect(transport.reply).toHaveBeenCalledWith(event, {});
            });

            expect(driver.sendScheduledDelayedEvent).toHaveBeenCalledWith(event.data.delay_id);
        });

        it("should reject requests when the driver throws an exception", async () => {
            driver.sendScheduledDelayedEvent.mockRejectedValue(new Error("M_BAD_JSON: Content must be a JSON object"));

            const event: IUpdateDelayedEventFromWidgetActionRequest = {
                api: WidgetApiDirection.FromWidget,
                widgetId: "test",
                requestId: "0",
                action: WidgetApiFromWidgetAction.MSC4157UpdateDelayedEvent,
                data: {
                    delay_id: "f",
                    action: UpdateDelayedEventAction.Send,
                },
            };

            await loadIframe(["org.matrix.msc4157.update_delayed_event"]);

            emitEvent(new CustomEvent("", { detail: event }));

            await waitFor(() => {
                expect(transport.reply).toHaveBeenCalledWith(event, {
                    error: { message: "Error updating delayed event" },
                });
            });
        });

        it("should reject with Matrix API error response thrown by driver", async () => {
            driver.processError.mockImplementation(processCustomMatrixError);

            driver.sendScheduledDelayedEvent.mockRejectedValue(
                new CustomMatrixError("failed to update delayed event", 400, "M_NOT_JSON", {
                    reason: "Content must be a JSON object.",
                }),
            );

            const event: IUpdateDelayedEventFromWidgetActionRequest = {
                api: WidgetApiDirection.FromWidget,
                widgetId: "test",
                requestId: "0",
                action: WidgetApiFromWidgetAction.MSC4157UpdateDelayedEvent,
                data: {
                    delay_id: "f",
                    action: UpdateDelayedEventAction.Send,
                },
            };

            await loadIframe(["org.matrix.msc4157.update_delayed_event"]);

            emitEvent(new CustomEvent("", { detail: event }));

            await waitFor(() => {
                expect(transport.reply).toHaveBeenCalledWith(event, {
                    error: {
                        message: "Error updating delayed event",
                        matrix_api_error: {
                            http_status: 400,
                            http_headers: {},
                            url: "",
                            response: {
                                errcode: "M_NOT_JSON",
                                error: "failed to update delayed event",
                                reason: "Content must be a JSON object.",
                            },
                        } satisfies IMatrixApiError,
                    },
                });
            });
        });
    });

    describe("send_to_device action", () => {
        it("sends unencrypted to-device events", async () => {
            const event: ISendToDeviceFromWidgetActionRequest = {
                api: WidgetApiDirection.FromWidget,
                widgetId: "test",
                requestId: "0",
                action: WidgetApiFromWidgetAction.SendToDevice,
                data: {
                    type: "net.example.test",
                    encrypted: false,
                    messages: {
                        "@foo:bar.com": {
                            DEVICEID: {
                                example_content_key: "value",
                            },
                        },
                    },
                },
            };

            await loadIframe([`org.matrix.msc3819.send.to_device:${event.data.type}`]);

            emitEvent(new CustomEvent("", { detail: event }));

            await waitFor(() => {
                expect(transport.reply).toHaveBeenCalledWith(event, {});
            });

            expect(driver.sendToDevice).toHaveBeenCalledWith(
                event.data.type,
                event.data.encrypted,
                event.data.messages,
            );
        });

        it("fails to send to-device events without event type", async () => {
            const event: IWidgetApiRequest = {
                api: WidgetApiDirection.FromWidget,
                widgetId: "test",
                requestId: "0",
                action: WidgetApiFromWidgetAction.SendToDevice,
                data: {
                    encrypted: false,
                    messages: {
                        "@foo:bar.com": {
                            DEVICEID: {
                                example_content_key: "value",
                            },
                        },
                    },
                },
            };

            await loadIframe([`org.matrix.msc3819.send.to_device:${event.data.type}`]);

            emitEvent(new CustomEvent("", { detail: event }));

            await waitFor(() => {
                expect(transport.reply).toHaveBeenCalledWith(event, {
                    error: { message: "Invalid request - missing event type" },
                });
            });

            expect(driver.sendToDevice).not.toHaveBeenCalled();
        });

        it("fails to send to-device events without event contents", async () => {
            const event: IWidgetApiRequest = {
                api: WidgetApiDirection.FromWidget,
                widgetId: "test",
                requestId: "0",
                action: WidgetApiFromWidgetAction.SendToDevice,
                data: {
                    type: "net.example.test",
                    encrypted: false,
                },
            };

            await loadIframe([`org.matrix.msc3819.send.to_device:${event.data.type}`]);

            emitEvent(new CustomEvent("", { detail: event }));

            await waitFor(() => {
                expect(transport.reply).toHaveBeenCalledWith(event, {
                    error: { message: "Invalid request - missing event contents" },
                });
            });

            expect(driver.sendToDevice).not.toHaveBeenCalled();
        });

        it("fails to send to-device events without encryption flag", async () => {
            const event: IWidgetApiRequest = {
                api: WidgetApiDirection.FromWidget,
                widgetId: "test",
                requestId: "0",
                action: WidgetApiFromWidgetAction.SendToDevice,
                data: {
                    type: "net.example.test",
                    messages: {
                        "@foo:bar.com": {
                            DEVICEID: {
                                example_content_key: "value",
                            },
                        },
                    },
                },
            };

            await loadIframe([`org.matrix.msc3819.send.to_device:${event.data.type}`]);

            emitEvent(new CustomEvent("", { detail: event }));

            await waitFor(() => {
                expect(transport.reply).toHaveBeenCalledWith(event, {
                    error: { message: "Invalid request - missing encryption flag" },
                });
            });

            expect(driver.sendToDevice).not.toHaveBeenCalled();
        });

        it("fails to send to-device events with any event type", async () => {
            const event: ISendToDeviceFromWidgetActionRequest = {
                api: WidgetApiDirection.FromWidget,
                widgetId: "test",
                requestId: "0",
                action: WidgetApiFromWidgetAction.SendToDevice,
                data: {
                    type: "net.example.test",
                    encrypted: false,
                    messages: {
                        "@foo:bar.com": {
                            DEVICEID: {
                                example_content_key: "value",
                            },
                        },
                    },
                },
            };

            await loadIframe([`org.matrix.msc3819.send.to_device:${event.data.type}_different`]);

            emitEvent(new CustomEvent("", { detail: event }));

            await waitFor(() => {
                expect(transport.reply).toHaveBeenCalledWith(event, {
                    error: { message: "Cannot send to-device events of this type" },
                });
            });

            expect(driver.sendToDevice).not.toHaveBeenCalled();
        });

        it("should reject requests when the driver throws an exception", async () => {
            driver.sendToDevice.mockRejectedValue(
                new Error("M_FORBIDDEN: You don't have permission to send to-device events"),
            );

            const event: ISendToDeviceFromWidgetActionRequest = {
                api: WidgetApiDirection.FromWidget,
                widgetId: "test",
                requestId: "0",
                action: WidgetApiFromWidgetAction.SendToDevice,
                data: {
                    type: "net.example.test",
                    encrypted: false,
                    messages: {
                        "@foo:bar.com": {
                            DEVICEID: {
                                example_content_key: "value",
                            },
                        },
                    },
                },
            };

            await loadIframe([`org.matrix.msc3819.send.to_device:${event.data.type}`]);

            emitEvent(new CustomEvent("", { detail: event }));

            await waitFor(() => {
                expect(transport.reply).toHaveBeenCalledWith(event, {
                    error: { message: "Error sending event" },
                });
            });
        });

        it("should reject with Matrix API error response thrown by driver", async () => {
            driver.processError.mockImplementation(processCustomMatrixError);

            driver.sendToDevice.mockRejectedValue(
                new CustomMatrixError("failed to send event", 400, "M_FORBIDDEN", {
                    reason: "You don't have permission to send to-device events",
                }),
            );

            const event: ISendToDeviceFromWidgetActionRequest = {
                api: WidgetApiDirection.FromWidget,
                widgetId: "test",
                requestId: "0",
                action: WidgetApiFromWidgetAction.SendToDevice,
                data: {
                    type: "net.example.test",
                    encrypted: false,
                    messages: {
                        "@foo:bar.com": {
                            DEVICEID: {
                                example_content_key: "value",
                            },
                        },
                    },
                },
            };

            await loadIframe([`org.matrix.msc3819.send.to_device:${event.data.type}`]);

            emitEvent(new CustomEvent("", { detail: event }));

            await waitFor(() => {
                expect(transport.reply).toHaveBeenCalledWith(event, {
                    error: {
                        message: "Error sending event",
                        matrix_api_error: {
                            http_status: 400,
                            http_headers: {},
                            url: "",
                            response: {
                                errcode: "M_FORBIDDEN",
                                error: "failed to send event",
                                reason: "You don't have permission to send to-device events",
                            },
                        } satisfies IMatrixApiError,
                    },
                });
            });
        });
    });

    describe("get_openid action", () => {
        it("gets info", async () => {
            driver.askOpenID.mockImplementation((observable) => {
                observable.update({
                    state: OpenIDRequestState.Allowed,
                    token: {
                        access_token: "access_token",
                    },
                });
            });

            const event: IGetOpenIDActionRequest = {
                api: WidgetApiDirection.FromWidget,
                widgetId: "test",
                requestId: "0",
                action: WidgetApiFromWidgetAction.GetOpenIDCredentials,
                data: {},
            };

            await loadIframe([]);

            emitEvent(new CustomEvent("", { detail: event }));

            await waitFor(() => {
                expect(transport.reply).toHaveBeenCalledWith(event, {
                    state: OpenIDRequestState.Allowed,
                    access_token: "access_token",
                });
            });

            expect(driver.askOpenID).toHaveBeenCalledWith(expect.any(SimpleObservable));
        });

        it("fails when client provided invalid token", async () => {
            driver.askOpenID.mockImplementation((observable) => {
                observable.update({
                    state: OpenIDRequestState.Allowed,
                });
            });

            const event: IGetOpenIDActionRequest = {
                api: WidgetApiDirection.FromWidget,
                widgetId: "test",
                requestId: "0",
                action: WidgetApiFromWidgetAction.GetOpenIDCredentials,
                data: {},
            };

            await loadIframe([]);

            emitEvent(new CustomEvent("", { detail: event }));

            await waitFor(() => {
                expect(transport.reply).toHaveBeenCalledWith(event, {
                    error: { message: "client provided invalid OIDC token for an allowed request" },
                });
            });

            expect(driver.askOpenID).toHaveBeenCalledWith(expect.any(SimpleObservable));
        });
    });

    describe("com.beeper.read_room_account_data action", () => {
        it("reads room account data", async () => {
            const type = "net.example.test";
            const roomId = "!room:example.org";

            driver.readRoomAccountData.mockResolvedValue([
                {
                    type,
                    room_id: roomId,
                    content: {},
                },
            ]);

            const event: IReadRoomAccountDataFromWidgetActionRequest = {
                api: WidgetApiDirection.FromWidget,
                widgetId: "test",
                requestId: "0",
                action: WidgetApiFromWidgetAction.BeeperReadRoomAccountData,
                data: {
                    room_ids: [roomId],
                    type,
                },
            };

            await loadIframe([`com.beeper.capabilities.receive.room_account_data:${type}`]);

            emitEvent(new CustomEvent("", { detail: event }));

            await waitFor(() => {
                expect(transport.reply).toHaveBeenCalledWith(event, {
                    events: [
                        {
                            type,
                            room_id: roomId,
                            content: {},
                        },
                    ],
                });
            });

            expect(driver.readRoomAccountData).toHaveBeenCalledWith(event.data.type);
        });

        it("does not read room account data", async () => {
            const type = "net.example.test";
            const roomId = "!room:example.org";

            driver.readRoomAccountData.mockResolvedValue([
                {
                    type,
                    room_id: roomId,
                    content: {},
                },
            ]);

            const event: IReadRoomAccountDataFromWidgetActionRequest = {
                api: WidgetApiDirection.FromWidget,
                widgetId: "test",
                requestId: "0",
                action: WidgetApiFromWidgetAction.BeeperReadRoomAccountData,
                data: {
                    room_ids: [roomId],
                    type,
                },
            };

            await loadIframe([]); // Without the required capability

            emitEvent(new CustomEvent("", { detail: event }));

            await waitFor(() => {
                expect(transport.reply).toHaveBeenCalledWith(event, {
                    error: { message: "Cannot read room account data of this type" },
                });
            });

            expect(driver.readRoomAccountData).toHaveBeenCalledWith(event.data.type);
        });
    });

    describe("org.matrix.msc2876.read_events action", () => {
        it("reads events from a specific room", async () => {
            const roomId = "!room:example.org";
            jest.spyOn(clientWidgetApi, "getWidgetVersions").mockResolvedValue([]);
            const event = createRoomEvent({ room_id: roomId, type: "net.example.test", content: { test: "test" } });
            driver.readRoomTimeline.mockImplementation(async (rId) => {
                if (rId === roomId) return [event];
                return [];
            });

            const request: IReadEventFromWidgetActionRequest = {
                api: WidgetApiDirection.FromWidget,
                widgetId: "test",
                requestId: "0",
                action: WidgetApiFromWidgetAction.MSC2876ReadEvents,
                data: {
                    type: "net.example.test",
                    room_ids: [roomId],
                },
            };

            await loadIframe([
                `org.matrix.msc2762.timeline:${roomId}`,
                "org.matrix.msc2762.receive.event:net.example.test",
            ]);
            clientWidgetApi.setViewedRoomId(roomId);

            emitEvent(new CustomEvent("", { detail: request }));

            await waitFor(() => {
                expect(transport.reply).toHaveBeenCalledWith(request, {
                    events: [event],
                });
            });

            expect(driver.readRoomTimeline).toHaveBeenCalledWith(
                roomId,
                "net.example.test",
                undefined,
                undefined,
                0,
                undefined,
            );
        });

        it("reads events from all rooms", async () => {
            const roomId = "!room:example.org";
            const otherRoomId = "!other-room:example.org";
            jest.spyOn(clientWidgetApi, "getWidgetVersions").mockResolvedValue([]);
            const event = createRoomEvent({ room_id: roomId, type: "net.example.test", content: { test: "test" } });
            const otherRoomEvent = createRoomEvent({
                room_id: otherRoomId,
                type: "net.example.test",
                content: { hi: "there" },
            });
            driver.getKnownRooms.mockReturnValue([roomId, otherRoomId]);
            driver.readRoomTimeline.mockImplementation(async (rId) => {
                if (rId === roomId) return [event];
                if (rId === otherRoomId) return [otherRoomEvent];
                return [];
            });

            const request: IReadEventFromWidgetActionRequest = {
                api: WidgetApiDirection.FromWidget,
                widgetId: "test",
                requestId: "0",
                action: WidgetApiFromWidgetAction.MSC2876ReadEvents,
                data: {
                    type: "net.example.test",
                    room_ids: Symbols.AnyRoom,
                },
            };

            await loadIframe([
                `org.matrix.msc2762.timeline:${Symbols.AnyRoom}`,
                "org.matrix.msc2762.receive.event:net.example.test",
            ]);
            clientWidgetApi.setViewedRoomId(roomId);

            emitEvent(new CustomEvent("", { detail: request }));

            await waitFor(() => {
                expect(transport.reply).toHaveBeenCalledWith(request, {
                    events: [event, otherRoomEvent],
                });
            });

            expect(driver.readRoomTimeline).toHaveBeenCalledWith(
                roomId,
                "net.example.test",
                undefined,
                undefined,
                0,
                undefined,
            );
            expect(driver.readRoomTimeline).toHaveBeenCalledWith(
                otherRoomId,
                "net.example.test",
                undefined,
                undefined,
                0,
                undefined,
            );
        });

        it("reads state events with any state key", async () => {
            jest.spyOn(clientWidgetApi, "getWidgetVersions").mockResolvedValue([]);
            driver.readRoomState.mockResolvedValue([
                createRoomEvent({ type: "net.example.test", state_key: "A" }),
                createRoomEvent({ type: "net.example.test", state_key: "B" }),
            ]);

            const event: IReadEventFromWidgetActionRequest = {
                api: WidgetApiDirection.FromWidget,
                widgetId: "test",
                requestId: "0",
                action: WidgetApiFromWidgetAction.MSC2876ReadEvents,
                data: {
                    type: "net.example.test",
                    state_key: true,
                },
            };

            await loadIframe(["org.matrix.msc2762.receive.state_event:net.example.test"]);
            clientWidgetApi.setViewedRoomId("!room-id");

            emitEvent(new CustomEvent("", { detail: event }));

            await waitFor(() => {
                expect(transport.reply).toHaveBeenCalledWith(event, {
                    events: [
                        createRoomEvent({ type: "net.example.test", state_key: "A" }),
                        createRoomEvent({ type: "net.example.test", state_key: "B" }),
                    ],
                });
            });

            expect(driver.readRoomState).toHaveBeenLastCalledWith("!room-id", "net.example.test", undefined);
        });

        it("fails to read state events with any state key", async () => {
            const event: IReadEventFromWidgetActionRequest = {
                api: WidgetApiDirection.FromWidget,
                widgetId: "test",
                requestId: "0",
                action: WidgetApiFromWidgetAction.MSC2876ReadEvents,
                data: {
                    type: "net.example.test",
                    state_key: true,
                },
            };

            await loadIframe([]); // Without the required capability

            emitEvent(new CustomEvent("", { detail: event }));

            await waitFor(() => {
                expect(transport.reply).toHaveBeenCalledWith(event, {
                    error: { message: expect.any(String) },
                });
            });

            expect(driver.readRoomTimeline).not.toHaveBeenCalled();
        });

        it("reads state events with a specific state key", async () => {
            jest.spyOn(clientWidgetApi, "getWidgetVersions").mockResolvedValue([]);
            driver.readRoomState.mockResolvedValue([createRoomEvent({ type: "net.example.test", state_key: "B" })]);

            const event: IReadEventFromWidgetActionRequest = {
                api: WidgetApiDirection.FromWidget,
                widgetId: "test",
                requestId: "0",
                action: WidgetApiFromWidgetAction.MSC2876ReadEvents,
                data: {
                    type: "net.example.test",
                    state_key: "B",
                },
            };

            await loadIframe(["org.matrix.msc2762.receive.state_event:net.example.test#B"]);
            clientWidgetApi.setViewedRoomId("!room-id");

            emitEvent(new CustomEvent("", { detail: event }));

            await waitFor(() => {
                expect(transport.reply).toHaveBeenCalledWith(event, {
                    events: [createRoomEvent({ type: "net.example.test", state_key: "B" })],
                });
            });

            expect(driver.readRoomState).toHaveBeenLastCalledWith("!room-id", "net.example.test", "B");
        });

        it("reads state events with a specific state key from the timeline when using UnstableApiVersion.MSC2762_UPDATE_STATE", async () => {
            jest.spyOn(clientWidgetApi, "getWidgetVersions").mockResolvedValue(CurrentApiVersions);
            // with version MSC2762_UPDATE_STATE we wan the read Events action to read state events from the timeline.
            driver.readRoomTimeline.mockResolvedValue([createRoomEvent({ type: "net.example.test", state_key: "B" })]);

            const event: IReadEventFromWidgetActionRequest = {
                api: WidgetApiDirection.FromWidget,
                widgetId: "test",
                requestId: "0",
                action: WidgetApiFromWidgetAction.MSC2876ReadEvents,
                data: {
                    type: "net.example.test",
                    state_key: "B",
                },
            };

            await loadIframe(["org.matrix.msc2762.receive.state_event:net.example.test#B"]);

            clientWidgetApi.setViewedRoomId("!room-id");

            // we clear the mock here because setViewedRoomId will push the room state and therefore read it
            // from the driver.
            driver.readRoomState.mockClear();
            // clearing this as well so it gets the same treatment as readRoomState for reference
            driver.readRoomTimeline.mockClear();

            emitEvent(new CustomEvent("", { detail: event }));

            await waitFor(() => {
                expect(transport.reply).toHaveBeenCalledWith(event, {
                    events: [createRoomEvent({ type: "net.example.test", state_key: "B" })],
                });
            });

            expect(driver.readRoomTimeline).toHaveBeenLastCalledWith(
                "!room-id",
                "net.example.test",
                undefined,
                "B",
                0,
                undefined,
            );
            expect(driver.readRoomState).not.toHaveBeenCalled();
        });

        it("fails to read state events with a specific state key", async () => {
            const event: IReadEventFromWidgetActionRequest = {
                api: WidgetApiDirection.FromWidget,
                widgetId: "test",
                requestId: "0",
                action: WidgetApiFromWidgetAction.MSC2876ReadEvents,
                data: {
                    type: "net.example.test",
                    state_key: "B",
                },
            };

            // Request the capability for the wrong state key
            await loadIframe(["org.matrix.msc2762.receive.state_event:net.example.test#A"]);

            emitEvent(new CustomEvent("", { detail: event }));

            await waitFor(() => {
                expect(transport.reply).toHaveBeenCalledWith(event, {
                    error: { message: expect.any(String) },
                });
            });

            expect(driver.readRoomTimeline).not.toHaveBeenCalled();
        });
    });

    describe("org.matrix.msc3869.read_relations action", () => {
        it("should present as supported api version", () => {
            const event: ISupportedVersionsActionRequest = {
                api: WidgetApiDirection.FromWidget,
                widgetId: "test",
                requestId: "0",
                action: WidgetApiFromWidgetAction.SupportedApiVersions,
                data: {},
            };

            emitEvent(new CustomEvent("", { detail: event }));

            expect(transport.reply).toHaveBeenCalledWith(event, {
                supported_versions: expect.arrayContaining([UnstableApiVersion.MSC3869]),
            });
        });

        it("should handle and process the request", async () => {
            driver.readEventRelations.mockResolvedValue({
                chunk: [createRoomEvent()],
            });

            const event: IReadRelationsFromWidgetActionRequest = {
                api: WidgetApiDirection.FromWidget,
                widgetId: "test",
                requestId: "0",
                action: WidgetApiFromWidgetAction.MSC3869ReadRelations,
                data: { event_id: "$event" },
            };

            await loadIframe(["org.matrix.msc2762.receive.event:m.room.message"]);

            emitEvent(new CustomEvent("", { detail: event }));

            await waitFor(() => {
                expect(transport.reply).toHaveBeenCalledWith(event, {
                    chunk: [createRoomEvent()],
                });
            });

            expect(driver.readEventRelations).toHaveBeenCalledWith(
                "$event",
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
            );
        });

        it("should only return events that match requested capabilities", async () => {
            driver.readEventRelations.mockResolvedValue({
                chunk: [
                    createRoomEvent(),
                    createRoomEvent({ type: "m.reaction" }),
                    createRoomEvent({ type: "net.example.test", state_key: "A" }),
                    createRoomEvent({ type: "net.example.test", state_key: "B" }),
                ],
            });

            const event: IReadRelationsFromWidgetActionRequest = {
                api: WidgetApiDirection.FromWidget,
                widgetId: "test",
                requestId: "0",
                action: WidgetApiFromWidgetAction.MSC3869ReadRelations,
                data: { event_id: "$event" },
            };

            await loadIframe([
                "org.matrix.msc2762.receive.event:m.room.message",
                "org.matrix.msc2762.receive.state_event:net.example.test#A",
            ]);

            emitEvent(new CustomEvent("", { detail: event }));

            await waitFor(() => {
                expect(transport.reply).toHaveBeenCalledWith(event, {
                    chunk: [createRoomEvent(), createRoomEvent({ type: "net.example.test", state_key: "A" })],
                });
            });

            expect(driver.readEventRelations).toHaveBeenCalledWith(
                "$event",
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
            );
        });

        it("should accept all options and pass it to the driver", async () => {
            driver.readEventRelations.mockResolvedValue({
                chunk: [],
            });

            const event: IReadRelationsFromWidgetActionRequest = {
                api: WidgetApiDirection.FromWidget,
                widgetId: "test",
                requestId: "0",
                action: WidgetApiFromWidgetAction.MSC3869ReadRelations,
                data: {
                    event_id: "$event",
                    room_id: "!room-id",
                    event_type: "m.room.message",
                    rel_type: "m.reference",
                    limit: 25,
                    from: "from-token",
                    to: "to-token",
                    direction: "f",
                },
            };

            await loadIframe(["org.matrix.msc2762.timeline:!room-id"]);

            emitEvent(new CustomEvent("", { detail: event }));

            await waitFor(() => {
                expect(transport.reply).toHaveBeenCalledWith(event, {
                    chunk: [],
                });
            });

            expect(driver.readEventRelations).toHaveBeenCalledWith(
                "$event",
                "!room-id",
                "m.reference",
                "m.room.message",
                "from-token",
                "to-token",
                25,
                "f",
            );
        });

        it("should reject requests without event_id", async () => {
            const event: IWidgetApiRequest = {
                api: WidgetApiDirection.FromWidget,
                widgetId: "test",
                requestId: "0",
                action: WidgetApiFromWidgetAction.MSC3869ReadRelations,
                data: {},
            };

            emitEvent(new CustomEvent("", { detail: event }));

            expect(transport.reply).toHaveBeenCalledWith(event, {
                error: { message: "Invalid request - missing event ID" },
            });
        });

        it("should reject requests with a negative limit", async () => {
            const event: IReadRelationsFromWidgetActionRequest = {
                api: WidgetApiDirection.FromWidget,
                widgetId: "test",
                requestId: "0",
                action: WidgetApiFromWidgetAction.MSC3869ReadRelations,
                data: {
                    event_id: "$event",
                    limit: -1,
                },
            };

            emitEvent(new CustomEvent("", { detail: event }));

            expect(transport.reply).toHaveBeenCalledWith(event, {
                error: { message: "Invalid request - limit out of range" },
            });
        });

        it("should reject requests when the room timeline was not requested", async () => {
            const event: IReadRelationsFromWidgetActionRequest = {
                api: WidgetApiDirection.FromWidget,
                widgetId: "test",
                requestId: "0",
                action: WidgetApiFromWidgetAction.MSC3869ReadRelations,
                data: {
                    event_id: "$event",
                    room_id: "!another-room-id",
                },
            };

            emitEvent(new CustomEvent("", { detail: event }));

            expect(transport.reply).toHaveBeenCalledWith(event, {
                error: { message: "Unable to access room timeline: !another-room-id" },
            });
        });

        it("should reject requests when the driver throws an exception", async () => {
            driver.readEventRelations.mockRejectedValue(
                new Error("M_FORBIDDEN: You don't have permission to access that event"),
            );

            const event: IReadRelationsFromWidgetActionRequest = {
                api: WidgetApiDirection.FromWidget,
                widgetId: "test",
                requestId: "0",
                action: WidgetApiFromWidgetAction.MSC3869ReadRelations,
                data: { event_id: "$event" },
            };

            await loadIframe();

            emitEvent(new CustomEvent("", { detail: event }));

            await waitFor(() => {
                expect(transport.reply).toHaveBeenCalledWith(event, {
                    error: { message: "Unexpected error while reading relations" },
                });
            });
        });

        it("should reject with Matrix API error response thrown by driver", async () => {
            driver.processError.mockImplementation(processCustomMatrixError);

            driver.readEventRelations.mockRejectedValue(
                new CustomMatrixError("failed to read relations", 403, "M_FORBIDDEN", {
                    reason: "You don't have permission to access that event",
                }),
            );

            const event: IReadRelationsFromWidgetActionRequest = {
                api: WidgetApiDirection.FromWidget,
                widgetId: "test",
                requestId: "0",
                action: WidgetApiFromWidgetAction.MSC3869ReadRelations,
                data: { event_id: "$event" },
            };

            await loadIframe();

            emitEvent(new CustomEvent("", { detail: event }));

            await waitFor(() => {
                expect(transport.reply).toHaveBeenCalledWith(event, {
                    error: {
                        message: "Unexpected error while reading relations",
                        matrix_api_error: {
                            http_status: 403,
                            http_headers: {},
                            url: "",
                            response: {
                                errcode: "M_FORBIDDEN",
                                error: "failed to read relations",
                                reason: "You don't have permission to access that event",
                            },
                        } satisfies IMatrixApiError,
                    },
                });
            });
        });
    });

    describe("org.matrix.msc3973.user_directory_search action", () => {
        it("should present as supported api version", () => {
            const event: ISupportedVersionsActionRequest = {
                api: WidgetApiDirection.FromWidget,
                widgetId: "test",
                requestId: "0",
                action: WidgetApiFromWidgetAction.SupportedApiVersions,
                data: {},
            };

            emitEvent(new CustomEvent("", { detail: event }));

            expect(transport.reply).toHaveBeenCalledWith(event, {
                supported_versions: expect.arrayContaining([UnstableApiVersion.MSC3973]),
            });
        });

        it("should handle and process the request", async () => {
            driver.searchUserDirectory.mockResolvedValue({
                limited: true,
                results: [
                    {
                        userId: "@foo:bar.com",
                    },
                ],
            });

            const event: IUserDirectorySearchFromWidgetActionRequest = {
                api: WidgetApiDirection.FromWidget,
                widgetId: "test",
                requestId: "0",
                action: WidgetApiFromWidgetAction.MSC3973UserDirectorySearch,
                data: { search_term: "foo" },
            };

            await loadIframe(["org.matrix.msc3973.user_directory_search"]);

            emitEvent(new CustomEvent("", { detail: event }));

            await waitFor(() => {
                expect(transport.reply).toHaveBeenCalledWith(event, {
                    limited: true,
                    results: [
                        {
                            user_id: "@foo:bar.com",
                            display_name: undefined,
                            avatar_url: undefined,
                        },
                    ],
                });
            });

            expect(driver.searchUserDirectory).toHaveBeenCalledWith("foo", undefined);
        });

        it("should accept all options and pass it to the driver", async () => {
            driver.searchUserDirectory.mockResolvedValue({
                limited: false,
                results: [
                    {
                        userId: "@foo:bar.com",
                    },
                    {
                        userId: "@bar:foo.com",
                        displayName: "Bar",
                        avatarUrl: "mxc://...",
                    },
                ],
            });

            const event: IUserDirectorySearchFromWidgetActionRequest = {
                api: WidgetApiDirection.FromWidget,
                widgetId: "test",
                requestId: "0",
                action: WidgetApiFromWidgetAction.MSC3973UserDirectorySearch,
                data: {
                    search_term: "foo",
                    limit: 5,
                },
            };

            await loadIframe(["org.matrix.msc3973.user_directory_search"]);

            emitEvent(new CustomEvent("", { detail: event }));

            await waitFor(() => {
                expect(transport.reply).toHaveBeenCalledWith(event, {
                    limited: false,
                    results: [
                        {
                            user_id: "@foo:bar.com",
                            display_name: undefined,
                            avatar_url: undefined,
                        },
                        {
                            user_id: "@bar:foo.com",
                            display_name: "Bar",
                            avatar_url: "mxc://...",
                        },
                    ],
                });
            });

            expect(driver.searchUserDirectory).toHaveBeenCalledWith("foo", 5);
        });

        it("should accept empty search_term", async () => {
            driver.searchUserDirectory.mockResolvedValue({
                limited: false,
                results: [],
            });

            const event: IUserDirectorySearchFromWidgetActionRequest = {
                api: WidgetApiDirection.FromWidget,
                widgetId: "test",
                requestId: "0",
                action: WidgetApiFromWidgetAction.MSC3973UserDirectorySearch,
                data: { search_term: "" },
            };

            await loadIframe(["org.matrix.msc3973.user_directory_search"]);

            emitEvent(new CustomEvent("", { detail: event }));

            await waitFor(() => {
                expect(transport.reply).toHaveBeenCalledWith(event, {
                    limited: false,
                    results: [],
                });
            });

            expect(driver.searchUserDirectory).toHaveBeenCalledWith("", undefined);
        });

        it("should reject requests when the capability was not requested", async () => {
            const event: IUserDirectorySearchFromWidgetActionRequest = {
                api: WidgetApiDirection.FromWidget,
                widgetId: "test",
                requestId: "0",
                action: WidgetApiFromWidgetAction.MSC3973UserDirectorySearch,
                data: { search_term: "foo" },
            };

            emitEvent(new CustomEvent("", { detail: event }));

            expect(transport.reply).toHaveBeenCalledWith(event, {
                error: { message: "Missing capability" },
            });

            expect(driver.searchUserDirectory).not.toHaveBeenCalled();
        });

        it("should reject requests without search_term", async () => {
            const event: IWidgetApiRequest = {
                api: WidgetApiDirection.FromWidget,
                widgetId: "test",
                requestId: "0",
                action: WidgetApiFromWidgetAction.MSC3973UserDirectorySearch,
                data: {},
            };

            await loadIframe(["org.matrix.msc3973.user_directory_search"]);

            emitEvent(new CustomEvent("", { detail: event }));

            expect(transport.reply).toHaveBeenCalledWith(event, {
                error: { message: "Invalid request - missing search term" },
            });

            expect(driver.searchUserDirectory).not.toHaveBeenCalled();
        });

        it("should reject requests with a negative limit", async () => {
            const event: IUserDirectorySearchFromWidgetActionRequest = {
                api: WidgetApiDirection.FromWidget,
                widgetId: "test",
                requestId: "0",
                action: WidgetApiFromWidgetAction.MSC3973UserDirectorySearch,
                data: {
                    search_term: "foo",
                    limit: -1,
                },
            };

            await loadIframe(["org.matrix.msc3973.user_directory_search"]);

            emitEvent(new CustomEvent("", { detail: event }));

            expect(transport.reply).toHaveBeenCalledWith(event, {
                error: { message: "Invalid request - limit out of range" },
            });

            expect(driver.searchUserDirectory).not.toHaveBeenCalled();
        });

        it("should reject requests when the driver throws an exception", async () => {
            driver.searchUserDirectory.mockRejectedValue(new Error("M_LIMIT_EXCEEDED: Too many requests"));

            const event: IUserDirectorySearchFromWidgetActionRequest = {
                api: WidgetApiDirection.FromWidget,
                widgetId: "test",
                requestId: "0",
                action: WidgetApiFromWidgetAction.MSC3973UserDirectorySearch,
                data: { search_term: "foo" },
            };

            await loadIframe(["org.matrix.msc3973.user_directory_search"]);

            emitEvent(new CustomEvent("", { detail: event }));

            await waitFor(() => {
                expect(transport.reply).toHaveBeenCalledWith(event, {
                    error: { message: "Unexpected error while searching in the user directory" },
                });
            });
        });

        it("should reject with Matrix API error response thrown by driver", async () => {
            driver.processError.mockImplementation(processCustomMatrixError);

            driver.searchUserDirectory.mockRejectedValue(
                new CustomMatrixError("failed to search the user directory", 429, "M_LIMIT_EXCEEDED", {
                    reason: "Too many requests",
                    retry_after_ms: 2000,
                }),
            );

            const event: IUserDirectorySearchFromWidgetActionRequest = {
                api: WidgetApiDirection.FromWidget,
                widgetId: "test",
                requestId: "0",
                action: WidgetApiFromWidgetAction.MSC3973UserDirectorySearch,
                data: { search_term: "foo" },
            };

            await loadIframe(["org.matrix.msc3973.user_directory_search"]);

            emitEvent(new CustomEvent("", { detail: event }));

            await waitFor(() => {
                expect(transport.reply).toHaveBeenCalledWith(event, {
                    error: {
                        message: "Unexpected error while searching in the user directory",
                        matrix_api_error: {
                            http_status: 429,
                            http_headers: {},
                            url: "",
                            response: {
                                errcode: "M_LIMIT_EXCEEDED",
                                error: "failed to search the user directory",
                                reason: "Too many requests",
                                retry_after_ms: 2000,
                            },
                        } satisfies IMatrixApiError,
                    },
                });
            });
        });
    });

    describe("org.matrix.msc4039.get_media_config action", () => {
        it("should present as supported api version", () => {
            const event: ISupportedVersionsActionRequest = {
                api: WidgetApiDirection.FromWidget,
                widgetId: "test",
                requestId: "0",
                action: WidgetApiFromWidgetAction.SupportedApiVersions,
                data: {},
            };

            emitEvent(new CustomEvent("", { detail: event }));

            expect(transport.reply).toHaveBeenCalledWith(event, {
                supported_versions: expect.arrayContaining([UnstableApiVersion.MSC4039]),
            });
        });

        it("should handle and process the request", async () => {
            driver.getMediaConfig.mockResolvedValue({
                "m.upload.size": 1000,
            });

            const event: IGetMediaConfigActionFromWidgetActionRequest = {
                api: WidgetApiDirection.FromWidget,
                widgetId: "test",
                requestId: "0",
                action: WidgetApiFromWidgetAction.MSC4039GetMediaConfigAction,
                data: {},
            };

            await loadIframe(["org.matrix.msc4039.upload_file"]);

            emitEvent(new CustomEvent("", { detail: event }));

            await waitFor(() => {
                expect(transport.reply).toHaveBeenCalledWith(event, {
                    "m.upload.size": 1000,
                });
            });

            expect(driver.getMediaConfig).toHaveBeenCalled();
        });

        it("should reject requests when the capability was not requested", async () => {
            const event: IGetMediaConfigActionFromWidgetActionRequest = {
                api: WidgetApiDirection.FromWidget,
                widgetId: "test",
                requestId: "0",
                action: WidgetApiFromWidgetAction.MSC4039GetMediaConfigAction,
                data: {},
            };

            emitEvent(new CustomEvent("", { detail: event }));

            expect(transport.reply).toHaveBeenCalledWith(event, {
                error: { message: "Missing capability" },
            });

            expect(driver.getMediaConfig).not.toHaveBeenCalled();
        });

        it("should reject requests when the driver throws an exception", async () => {
            driver.getMediaConfig.mockRejectedValue(new Error("M_LIMIT_EXCEEDED: Too many requests"));

            const event: IGetMediaConfigActionFromWidgetActionRequest = {
                api: WidgetApiDirection.FromWidget,
                widgetId: "test",
                requestId: "0",
                action: WidgetApiFromWidgetAction.MSC4039GetMediaConfigAction,
                data: {},
            };

            await loadIframe(["org.matrix.msc4039.upload_file"]);

            emitEvent(new CustomEvent("", { detail: event }));

            await waitFor(() => {
                expect(transport.reply).toHaveBeenCalledWith(event, {
                    error: { message: "Unexpected error while getting the media configuration" },
                });
            });
        });

        it("should reject with Matrix API error response thrown by driver", async () => {
            driver.processError.mockImplementation(processCustomMatrixError);

            driver.getMediaConfig.mockRejectedValue(
                new CustomMatrixError("failed to get the media configuration", 429, "M_LIMIT_EXCEEDED", {
                    reason: "Too many requests",
                    retry_after_ms: 2000,
                }),
            );

            const event: IGetMediaConfigActionFromWidgetActionRequest = {
                api: WidgetApiDirection.FromWidget,
                widgetId: "test",
                requestId: "0",
                action: WidgetApiFromWidgetAction.MSC4039GetMediaConfigAction,
                data: {},
            };

            await loadIframe(["org.matrix.msc4039.upload_file"]);

            emitEvent(new CustomEvent("", { detail: event }));

            await waitFor(() => {
                expect(transport.reply).toHaveBeenCalledWith(event, {
                    error: {
                        message: "Unexpected error while getting the media configuration",
                        matrix_api_error: {
                            http_status: 429,
                            http_headers: {},
                            url: "",
                            response: {
                                errcode: "M_LIMIT_EXCEEDED",
                                error: "failed to get the media configuration",
                                reason: "Too many requests",
                                retry_after_ms: 2000,
                            },
                        } satisfies IMatrixApiError,
                    },
                });
            });
        });
    });

    describe("MSC4039", () => {
        it("should present as supported api version", () => {
            const event: ISupportedVersionsActionRequest = {
                api: WidgetApiDirection.FromWidget,
                widgetId: "test",
                requestId: "0",
                action: WidgetApiFromWidgetAction.SupportedApiVersions,
                data: {},
            };

            emitEvent(new CustomEvent("", { detail: event }));

            expect(transport.reply).toHaveBeenCalledWith(event, {
                supported_versions: expect.arrayContaining([UnstableApiVersion.MSC4039]),
            });
        });
    });

    describe("org.matrix.msc4039.upload_file action", () => {
        it("should handle and process the request", async () => {
            driver.uploadFile.mockResolvedValue({
                contentUri: "mxc://...",
            });

            const event: IUploadFileActionFromWidgetActionRequest = {
                api: WidgetApiDirection.FromWidget,
                widgetId: "test",
                requestId: "0",
                action: WidgetApiFromWidgetAction.MSC4039UploadFileAction,
                data: {
                    file: "data",
                },
            };

            await loadIframe(["org.matrix.msc4039.upload_file"]);

            emitEvent(new CustomEvent("", { detail: event }));

            await waitFor(() => {
                expect(transport.reply).toHaveBeenCalledWith(event, {
                    content_uri: "mxc://...",
                });
            });

            expect(driver.uploadFile).toHaveBeenCalled();
        });

        it("should reject requests when the capability was not requested", async () => {
            const event: IUploadFileActionFromWidgetActionRequest = {
                api: WidgetApiDirection.FromWidget,
                widgetId: "test",
                requestId: "0",
                action: WidgetApiFromWidgetAction.MSC4039UploadFileAction,
                data: {
                    file: "data",
                },
            };

            emitEvent(new CustomEvent("", { detail: event }));

            expect(transport.reply).toHaveBeenCalledWith(event, {
                error: { message: "Missing capability" },
            });

            expect(driver.uploadFile).not.toHaveBeenCalled();
        });

        it("should reject requests when the driver throws an exception", async () => {
            driver.uploadFile.mockRejectedValue(new Error("M_LIMIT_EXCEEDED: Too many requests"));

            const event: IUploadFileActionFromWidgetActionRequest = {
                api: WidgetApiDirection.FromWidget,
                widgetId: "test",
                requestId: "0",
                action: WidgetApiFromWidgetAction.MSC4039UploadFileAction,
                data: {
                    file: "data",
                },
            };

            await loadIframe(["org.matrix.msc4039.upload_file"]);

            emitEvent(new CustomEvent("", { detail: event }));

            await waitFor(() => {
                expect(transport.reply).toHaveBeenCalledWith(event, {
                    error: { message: "Unexpected error while uploading a file" },
                });
            });
        });

        it("should reject with Matrix API error response thrown by driver", async () => {
            driver.processError.mockImplementation(processCustomMatrixError);

            driver.uploadFile.mockRejectedValue(
                new CustomMatrixError("failed to upload a file", 429, "M_LIMIT_EXCEEDED", {
                    reason: "Too many requests",
                    retry_after_ms: 2000,
                }),
            );

            const event: IUploadFileActionFromWidgetActionRequest = {
                api: WidgetApiDirection.FromWidget,
                widgetId: "test",
                requestId: "0",
                action: WidgetApiFromWidgetAction.MSC4039UploadFileAction,
                data: {
                    file: "data",
                },
            };

            await loadIframe(["org.matrix.msc4039.upload_file"]);

            emitEvent(new CustomEvent("", { detail: event }));

            await waitFor(() => {
                expect(transport.reply).toHaveBeenCalledWith(event, {
                    error: {
                        message: "Unexpected error while uploading a file",
                        matrix_api_error: {
                            http_status: 429,
                            http_headers: {},
                            url: "",
                            response: {
                                errcode: "M_LIMIT_EXCEEDED",
                                error: "failed to upload a file",
                                reason: "Too many requests",
                                retry_after_ms: 2000,
                            },
                        } satisfies IMatrixApiError,
                    },
                });
            });
        });
    });

    describe("org.matrix.msc4039.download_file action", () => {
        it("should handle and process the request", async () => {
            driver.downloadFile.mockResolvedValue({
                file: "test contents",
            });

            const event: IDownloadFileActionFromWidgetActionRequest = {
                api: WidgetApiDirection.FromWidget,
                widgetId: "test",
                requestId: "0",
                action: WidgetApiFromWidgetAction.MSC4039DownloadFileAction,
                data: {
                    content_uri: "mxc://example.com/test_file",
                },
            };

            await loadIframe(["org.matrix.msc4039.download_file"]);

            emitEvent(new CustomEvent("", { detail: event }));

            await waitFor(() => {
                expect(transport.reply).toHaveBeenCalledWith(event, {
                    file: "test contents",
                });
            });

            expect(driver.downloadFile).toHaveBeenCalledWith("mxc://example.com/test_file");
        });

        it("should reject requests when the capability was not requested", async () => {
            const event: IDownloadFileActionFromWidgetActionRequest = {
                api: WidgetApiDirection.FromWidget,
                widgetId: "test",
                requestId: "0",
                action: WidgetApiFromWidgetAction.MSC4039DownloadFileAction,
                data: {
                    content_uri: "mxc://example.com/test_file",
                },
            };

            emitEvent(new CustomEvent("", { detail: event }));

            expect(transport.reply).toHaveBeenCalledWith(event, {
                error: { message: "Missing capability" },
            });

            expect(driver.uploadFile).not.toHaveBeenCalled();
        });

        it("should reject requests when the driver throws an exception", async () => {
            driver.downloadFile.mockRejectedValue(new Error("M_LIMIT_EXCEEDED: Too many requests"));

            const event: IDownloadFileActionFromWidgetActionRequest = {
                api: WidgetApiDirection.FromWidget,
                widgetId: "test",
                requestId: "0",
                action: WidgetApiFromWidgetAction.MSC4039DownloadFileAction,
                data: {
                    content_uri: "mxc://example.com/test_file",
                },
            };

            await loadIframe(["org.matrix.msc4039.download_file"]);

            emitEvent(new CustomEvent("", { detail: event }));

            await waitFor(() => {
                expect(transport.reply).toHaveBeenCalledWith(event, {
                    error: { message: "Unexpected error while downloading a file" },
                });
            });
        });

        it("should reject with Matrix API error response thrown by driver", async () => {
            driver.processError.mockImplementation(processCustomMatrixError);

            driver.downloadFile.mockRejectedValue(
                new CustomMatrixError("failed to download a file", 429, "M_LIMIT_EXCEEDED", {
                    reason: "Too many requests",
                    retry_after_ms: 2000,
                }),
            );

            const event: IDownloadFileActionFromWidgetActionRequest = {
                api: WidgetApiDirection.FromWidget,
                widgetId: "test",
                requestId: "0",
                action: WidgetApiFromWidgetAction.MSC4039DownloadFileAction,
                data: {
                    content_uri: "mxc://example.com/test_file",
                },
            };

            await loadIframe(["org.matrix.msc4039.download_file"]);

            emitEvent(new CustomEvent("", { detail: event }));

            await waitFor(() => {
                expect(transport.reply).toHaveBeenCalledWith(event, {
                    error: {
                        message: "Unexpected error while downloading a file",
                        matrix_api_error: {
                            http_status: 429,
                            http_headers: {},
                            url: "",
                            response: {
                                errcode: "M_LIMIT_EXCEEDED",
                                error: "failed to download a file",
                                reason: "Too many requests",
                                retry_after_ms: 2000,
                            },
                        } satisfies IMatrixApiError,
                    },
                });
            });
        });
    });

    it("updates theme", () => {
        clientWidgetApi.updateTheme({ name: "dark" });
        expect(transport.send).toHaveBeenCalledWith(WidgetApiToWidgetAction.ThemeChange, { name: "dark" });
    });

    it("updates language", () => {
        clientWidgetApi.updateLanguage("tlh");
        expect(transport.send).toHaveBeenCalledWith(WidgetApiToWidgetAction.LanguageChange, { lang: "tlh" });
    });
});

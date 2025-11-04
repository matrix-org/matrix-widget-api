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

import { UnstableApiVersion } from "../src/interfaces/ApiVersion";
import { IGetMediaConfigActionFromWidgetResponseData } from "../src/interfaces/GetMediaConfigAction";
import { IReadRelationsFromWidgetResponseData } from "../src/interfaces/ReadRelationsAction";
import { ISendEventFromWidgetResponseData } from "../src/interfaces/SendEventAction";
import { ISupportedVersionsActionResponseData } from "../src/interfaces/SupportedVersionsAction";
import { IUploadFileActionFromWidgetResponseData } from "../src/interfaces/UploadFileAction";
import { IDownloadFileActionFromWidgetResponseData } from "../src/interfaces/DownloadFileAction";
import { IUserDirectorySearchFromWidgetResponseData } from "../src/interfaces/UserDirectorySearchAction";
import { WidgetApiFromWidgetAction } from "../src/interfaces/WidgetApiAction";
import { WidgetApi, WidgetApiResponseError } from "../src/WidgetApi";
import {
    IWidgetApiErrorResponseData,
    IWidgetApiErrorResponseDataDetails,
    IWidgetApiRequest,
    IWidgetApiRequestData,
    IWidgetApiResponse,
    IWidgetApiResponseData,
    WidgetApiDirection,
} from "../src";

type SendRequestArgs = {
    action: WidgetApiFromWidgetAction;
    data: IWidgetApiRequestData;
};

class TransportChannels {
    /** Data sent by widget requests */
    public readonly requestQueue: Array<SendRequestArgs> = [];
    /** Responses to send as if from a client. Initialized with the response to {@link WidgetApi.start}*/
    public readonly responseQueue: IWidgetApiResponseData[] = [
        { supported_versions: [] } satisfies ISupportedVersionsActionResponseData,
    ];
}

class WidgetTransportHelper {
    /** For ignoring the request sent by {@link WidgetApi.start} */
    private skippedFirstRequest = false;

    public constructor(private readonly channels: TransportChannels) {}

    public nextTrackedRequest(): SendRequestArgs | undefined {
        if (!this.skippedFirstRequest) {
            this.skippedFirstRequest = true;
            this.channels.requestQueue.shift();
        }
        return this.channels.requestQueue.shift();
    }

    public queueResponse(data: IWidgetApiResponseData): void {
        this.channels.responseQueue.push(data);
    }
}

class ClientTransportHelper {
    public constructor(private readonly channels: TransportChannels) {}

    public trackRequest(action: WidgetApiFromWidgetAction, data: IWidgetApiRequestData): void {
        this.channels.requestQueue.push({ action, data });
    }

    public nextQueuedResponse(): IWidgetApiRequestData | undefined {
        return this.channels.responseQueue.shift();
    }
}

describe("WidgetApi", () => {
    let widgetApi: WidgetApi;
    let widgetTransportHelper: WidgetTransportHelper;
    let clientListener: (e: MessageEvent) => void;

    beforeEach(() => {
        const channels = new TransportChannels();
        widgetTransportHelper = new WidgetTransportHelper(channels);
        const clientTrafficHelper = new ClientTransportHelper(channels);

        clientListener = (e: MessageEvent): void => {
            if (!e.data.action || !e.data.requestId || !e.data.widgetId) return; // invalid request/response
            if ("response" in e.data || e.data.api !== WidgetApiDirection.FromWidget) return; // not a request
            const request = <IWidgetApiRequest>e.data;

            clientTrafficHelper.trackRequest(request.action as WidgetApiFromWidgetAction, request.data);

            const response = clientTrafficHelper.nextQueuedResponse();
            if (response) {
                globalThis.postMessage(
                    {
                        ...request,
                        response: response,
                    } satisfies IWidgetApiResponse,
                    "*",
                );
            }
        };
        globalThis.addEventListener("message", clientListener);

        widgetApi = new WidgetApi("WidgetApi-test", "*");
        widgetApi.start();
    });

    afterEach(() => {
        globalThis.removeEventListener("message", clientListener);
    });

    describe("readEventRelations", () => {
        it("should forward the request to the ClientWidgetApi", async () => {
            widgetTransportHelper.queueResponse({
                supported_versions: [UnstableApiVersion.MSC3869],
            } as ISupportedVersionsActionResponseData);
            widgetTransportHelper.queueResponse({
                chunk: [],
            } as IReadRelationsFromWidgetResponseData);

            await expect(
                widgetApi.readEventRelations(
                    "$event",
                    "!room-id",
                    "m.reference",
                    "m.room.message",
                    25,
                    "from-token",
                    "to-token",
                    "f",
                ),
            ).resolves.toEqual({
                chunk: [],
            });

            expect(widgetTransportHelper.nextTrackedRequest()).not.toBeUndefined();
            expect(widgetTransportHelper.nextTrackedRequest()).toEqual({
                action: WidgetApiFromWidgetAction.MSC3869ReadRelations,
                data: {
                    event_id: "$event",
                    room_id: "!room-id",
                    rel_type: "m.reference",
                    event_type: "m.room.message",
                    limit: 25,
                    from: "from-token",
                    to: "to-token",
                    direction: "f",
                },
            } satisfies SendRequestArgs);
        });

        it("should reject the request if the api is not supported", async () => {
            widgetTransportHelper.queueResponse({ supported_versions: [] } as ISupportedVersionsActionResponseData);

            await expect(
                widgetApi.readEventRelations(
                    "$event",
                    "!room-id",
                    "m.reference",
                    "m.room.message",
                    25,
                    "from-token",
                    "to-token",
                    "f",
                ),
            ).rejects.toThrow("The read_relations action is not supported by the client.");

            const request = widgetTransportHelper.nextTrackedRequest();
            expect(request).not.toBeUndefined();
            expect(request).not.toEqual({
                action: WidgetApiFromWidgetAction.MSC3869ReadRelations,
                data: expect.anything(),
            } satisfies SendRequestArgs);
        });

        it("should handle an error", async () => {
            widgetTransportHelper.queueResponse({
                supported_versions: [UnstableApiVersion.MSC3869],
            } as ISupportedVersionsActionResponseData);
            widgetTransportHelper.queueResponse({
                error: { message: "An error occurred" },
            } as IWidgetApiErrorResponseData);

            await expect(
                widgetApi.readEventRelations(
                    "$event",
                    "!room-id",
                    "m.reference",
                    "m.room.message",
                    25,
                    "from-token",
                    "to-token",
                    "f",
                ),
            ).rejects.toThrow("An error occurred");
        });

        it("should handle an error with details", async () => {
            widgetTransportHelper.queueResponse({
                supported_versions: [UnstableApiVersion.MSC3869],
            } as ISupportedVersionsActionResponseData);

            const errorDetails: IWidgetApiErrorResponseDataDetails = {
                matrix_api_error: {
                    http_status: 400,
                    http_headers: {},
                    url: "",
                    response: {
                        errcode: "M_UNKNOWN",
                        error: "Unknown error",
                    },
                },
            };

            widgetTransportHelper.queueResponse({
                error: {
                    message: "An error occurred",
                    ...errorDetails,
                },
            } as IWidgetApiErrorResponseData);

            await expect(
                widgetApi.readEventRelations(
                    "$event",
                    "!room-id",
                    "m.reference",
                    "m.room.message",
                    25,
                    "from-token",
                    "to-token",
                    "f",
                ),
            ).rejects.toThrow(new WidgetApiResponseError("An error occurred", errorDetails));
        });
    });

    describe("sendEvent", () => {
        it("sends message events", async () => {
            widgetTransportHelper.queueResponse({
                room_id: "!room-id",
                event_id: "$event",
            } as ISendEventFromWidgetResponseData);

            await expect(widgetApi.sendRoomEvent("m.room.message", {}, "!room-id")).resolves.toEqual({
                room_id: "!room-id",
                event_id: "$event",
            });
        });

        it("sends state events", async () => {
            widgetTransportHelper.queueResponse({
                room_id: "!room-id",
                event_id: "$event",
            } as ISendEventFromWidgetResponseData);

            await expect(widgetApi.sendStateEvent("m.room.topic", "", {}, "!room-id")).resolves.toEqual({
                room_id: "!room-id",
                event_id: "$event",
            });
        });

        it("should handle an error", async () => {
            widgetTransportHelper.queueResponse({
                error: { message: "An error occurred" },
            } as IWidgetApiErrorResponseData);

            await expect(widgetApi.sendRoomEvent("m.room.message", {}, "!room-id")).rejects.toThrow(
                "An error occurred",
            );
        });

        it("should handle an error with details", async () => {
            const errorDetails: IWidgetApiErrorResponseDataDetails = {
                matrix_api_error: {
                    http_status: 400,
                    http_headers: {},
                    url: "",
                    response: {
                        errcode: "M_UNKNOWN",
                        error: "Unknown error",
                    },
                },
            };

            widgetTransportHelper.queueResponse({
                error: {
                    message: "An error occurred",
                    ...errorDetails,
                },
            } as IWidgetApiErrorResponseData);

            await expect(widgetApi.sendRoomEvent("m.room.message", {}, "!room-id")).rejects.toThrow(
                new WidgetApiResponseError("An error occurred", errorDetails),
            );
        });
    });

    describe("delayed sendEvent", () => {
        it("sends delayed message events", async () => {
            widgetTransportHelper.queueResponse({
                room_id: "!room-id",
                delay_id: "id",
            } as ISendEventFromWidgetResponseData);

            await expect(widgetApi.sendRoomEvent("m.room.message", {}, "!room-id", 2000)).resolves.toEqual({
                room_id: "!room-id",
                delay_id: "id",
            });
        });

        it("sends delayed state events", async () => {
            widgetTransportHelper.queueResponse({
                room_id: "!room-id",
                delay_id: "id",
            } as ISendEventFromWidgetResponseData);

            await expect(widgetApi.sendStateEvent("m.room.topic", "", {}, "!room-id", 2000)).resolves.toEqual({
                room_id: "!room-id",
                delay_id: "id",
            });
        });

        it("sends delayed child action message events", async () => {
            widgetTransportHelper.queueResponse({
                room_id: "!room-id",
                delay_id: "id",
            } as ISendEventFromWidgetResponseData);

            await expect(widgetApi.sendRoomEvent("m.room.message", {}, "!room-id", 1000, "parent-id")).resolves.toEqual(
                {
                    room_id: "!room-id",
                    delay_id: "id",
                },
            );
        });

        it("sends delayed child action state events", async () => {
            widgetTransportHelper.queueResponse({
                room_id: "!room-id",
                delay_id: "id",
            } as ISendEventFromWidgetResponseData);

            await expect(
                widgetApi.sendStateEvent("m.room.topic", "", {}, "!room-id", 1000, "parent-id"),
            ).resolves.toEqual({
                room_id: "!room-id",
                delay_id: "id",
            });
        });

        it("should handle an error", async () => {
            widgetTransportHelper.queueResponse({
                error: { message: "An error occurred" },
            } as IWidgetApiErrorResponseData);

            await expect(widgetApi.sendRoomEvent("m.room.message", {}, "!room-id", 1000)).rejects.toThrow(
                "An error occurred",
            );
        });

        it("should handle an error with details", async () => {
            const errorDetails: IWidgetApiErrorResponseDataDetails = {
                matrix_api_error: {
                    http_status: 400,
                    http_headers: {},
                    url: "",
                    response: {
                        errcode: "M_UNKNOWN",
                        error: "Unknown error",
                    },
                },
            };

            widgetTransportHelper.queueResponse({
                error: {
                    message: "An error occurred",
                    ...errorDetails,
                },
            } as IWidgetApiErrorResponseData);

            await expect(widgetApi.sendRoomEvent("m.room.message", {}, "!room-id", 1000)).rejects.toThrow(
                new WidgetApiResponseError("An error occurred", errorDetails),
            );
        });
    });

    describe("updateDelayedEvent", () => {
        it("updates delayed events", async () => {
            for (const updateDelayedEvent of [
                widgetApi.cancelScheduledDelayedEvent,
                widgetApi.restartScheduledDelayedEvent,
                widgetApi.sendScheduledDelayedEvent,
            ]) {
                widgetTransportHelper.queueResponse({});
                await expect(updateDelayedEvent.call(widgetApi, "id")).resolves.toEqual({});
            }
        });

        it("should handle an error", async () => {
            for (const updateDelayedEvent of [
                widgetApi.cancelScheduledDelayedEvent,
                widgetApi.restartScheduledDelayedEvent,
                widgetApi.sendScheduledDelayedEvent,
            ]) {
                widgetTransportHelper.queueResponse({
                    error: { message: "An error occurred" },
                } as IWidgetApiErrorResponseData);

                await expect(updateDelayedEvent.call(widgetApi, "id")).rejects.toThrow("An error occurred");
            }
        });

        it("should handle an error with details", async () => {
            for (const updateDelayedEvent of [
                widgetApi.cancelScheduledDelayedEvent,
                widgetApi.restartScheduledDelayedEvent,
                widgetApi.sendScheduledDelayedEvent,
            ]) {
                const errorDetails: IWidgetApiErrorResponseDataDetails = {
                    matrix_api_error: {
                        http_status: 400,
                        http_headers: {},
                        url: "",
                        response: {
                            errcode: "M_UNKNOWN",
                            error: "Unknown error",
                        },
                    },
                };

                widgetTransportHelper.queueResponse({
                    error: {
                        message: "An error occurred",
                        ...errorDetails,
                    },
                } as IWidgetApiErrorResponseData);

                await expect(updateDelayedEvent.call(widgetApi, "id")).rejects.toThrow(
                    new WidgetApiResponseError("An error occurred", errorDetails),
                );
            }
        });
    });

    describe("getClientVersions", () => {
        beforeEach(() => {
            widgetTransportHelper.queueResponse({
                supported_versions: [UnstableApiVersion.MSC3869, UnstableApiVersion.MSC2762],
            } as ISupportedVersionsActionResponseData);
        });

        it("should request supported client versions", async () => {
            await expect(widgetApi.getClientVersions()).resolves.toEqual(["org.matrix.msc3869", "org.matrix.msc2762"]);
        });

        it("should cache supported client versions on successive calls", async () => {
            await expect(widgetApi.getClientVersions()).resolves.toEqual(["org.matrix.msc3869", "org.matrix.msc2762"]);

            await expect(widgetApi.getClientVersions()).resolves.toEqual(["org.matrix.msc3869", "org.matrix.msc2762"]);

            expect(widgetTransportHelper.nextTrackedRequest()).not.toBeUndefined();
            expect(widgetTransportHelper.nextTrackedRequest()).toBeUndefined();
        });
    });

    describe("searchUserDirectory", () => {
        it("should forward the request to the ClientWidgetApi", async () => {
            widgetTransportHelper.queueResponse({
                supported_versions: [UnstableApiVersion.MSC3973],
            } as ISupportedVersionsActionResponseData);
            widgetTransportHelper.queueResponse({
                limited: false,
                results: [],
            } as IUserDirectorySearchFromWidgetResponseData);

            await expect(widgetApi.searchUserDirectory("foo", 10)).resolves.toEqual({
                limited: false,
                results: [],
            });

            expect(widgetTransportHelper.nextTrackedRequest()).not.toBeUndefined();
            expect(widgetTransportHelper.nextTrackedRequest()).toEqual({
                action: WidgetApiFromWidgetAction.MSC3973UserDirectorySearch,
                data: {
                    search_term: "foo",
                    limit: 10,
                },
            } satisfies SendRequestArgs);
        });

        it("should reject the request if the api is not supported", async () => {
            widgetTransportHelper.queueResponse({ supported_versions: [] } as ISupportedVersionsActionResponseData);

            await expect(widgetApi.searchUserDirectory("foo", 10)).rejects.toThrow(
                "The user_directory_search action is not supported by the client.",
            );

            const request = widgetTransportHelper.nextTrackedRequest();
            expect(request).not.toBeUndefined();
            expect(request).not.toEqual({
                action: WidgetApiFromWidgetAction.MSC3973UserDirectorySearch,
                data: expect.anything(),
            } satisfies SendRequestArgs);
        });

        it("should handle an error", async () => {
            widgetTransportHelper.queueResponse({
                supported_versions: [UnstableApiVersion.MSC3973],
            } as ISupportedVersionsActionResponseData);
            widgetTransportHelper.queueResponse({ error: { message: "An error occurred" } });

            await expect(widgetApi.searchUserDirectory("foo", 10)).rejects.toThrow("An error occurred");
        });

        it("should handle an error with details", async () => {
            widgetTransportHelper.queueResponse({
                supported_versions: [UnstableApiVersion.MSC3973],
            } as ISupportedVersionsActionResponseData);

            const errorDetails: IWidgetApiErrorResponseDataDetails = {
                matrix_api_error: {
                    http_status: 400,
                    http_headers: {},
                    url: "",
                    response: {
                        errcode: "M_UNKNOWN",
                        error: "Unknown error",
                    },
                },
            };

            widgetTransportHelper.queueResponse({
                error: {
                    message: "An error occurred",
                    ...errorDetails,
                },
            } as IWidgetApiErrorResponseData);

            await expect(widgetApi.searchUserDirectory("foo", 10)).rejects.toThrow(
                new WidgetApiResponseError("An error occurred", errorDetails),
            );
        });
    });

    describe("getMediaConfig", () => {
        it("should forward the request to the ClientWidgetApi", async () => {
            widgetTransportHelper.queueResponse({
                supported_versions: [UnstableApiVersion.MSC4039],
            } as ISupportedVersionsActionResponseData);
            widgetTransportHelper.queueResponse({
                "m.upload.size": 1000,
            } as IGetMediaConfigActionFromWidgetResponseData);

            await expect(widgetApi.getMediaConfig()).resolves.toEqual({
                "m.upload.size": 1000,
            });

            expect(widgetTransportHelper.nextTrackedRequest()).not.toBeUndefined();
            expect(widgetTransportHelper.nextTrackedRequest()).toEqual({
                action: WidgetApiFromWidgetAction.MSC4039GetMediaConfigAction,
                data: {},
            } satisfies SendRequestArgs);
        });

        it("should reject the request if the api is not supported", async () => {
            widgetTransportHelper.queueResponse({ supported_versions: [] } as ISupportedVersionsActionResponseData);

            await expect(widgetApi.getMediaConfig()).rejects.toThrow(
                "The get_media_config action is not supported by the client.",
            );

            const request = widgetTransportHelper.nextTrackedRequest();
            expect(request).not.toBeUndefined();
            expect(request).not.toEqual({
                action: WidgetApiFromWidgetAction.MSC4039GetMediaConfigAction,
                data: expect.anything(),
            } satisfies SendRequestArgs);
        });

        it("should handle an error", async () => {
            widgetTransportHelper.queueResponse({
                supported_versions: [UnstableApiVersion.MSC4039],
            } as ISupportedVersionsActionResponseData);
            widgetTransportHelper.queueResponse({ error: { message: "An error occurred" } });

            await expect(widgetApi.getMediaConfig()).rejects.toThrow("An error occurred");
        });

        it("should handle an error with details", async () => {
            widgetTransportHelper.queueResponse({
                supported_versions: [UnstableApiVersion.MSC4039],
            } as ISupportedVersionsActionResponseData);

            const errorDetails: IWidgetApiErrorResponseDataDetails = {
                matrix_api_error: {
                    http_status: 400,
                    http_headers: {},
                    url: "",
                    response: {
                        errcode: "M_UNKNOWN",
                        error: "Unknown error",
                    },
                },
            };

            widgetTransportHelper.queueResponse({
                error: {
                    message: "An error occurred",
                    ...errorDetails,
                },
            } as IWidgetApiErrorResponseData);

            await expect(widgetApi.getMediaConfig()).rejects.toThrow(
                new WidgetApiResponseError("An error occurred", errorDetails),
            );
        });
    });

    describe("uploadFile", () => {
        it("should forward the request to the ClientWidgetApi", async () => {
            widgetTransportHelper.queueResponse({
                supported_versions: [UnstableApiVersion.MSC4039],
            } as ISupportedVersionsActionResponseData);
            widgetTransportHelper.queueResponse({
                content_uri: "mxc://...",
            } as IUploadFileActionFromWidgetResponseData);

            await expect(widgetApi.uploadFile("data")).resolves.toEqual({
                content_uri: "mxc://...",
            });

            expect(widgetTransportHelper.nextTrackedRequest()).not.toBeUndefined();
            expect(widgetTransportHelper.nextTrackedRequest()).toEqual({
                action: WidgetApiFromWidgetAction.MSC4039UploadFileAction,
                data: { file: "data" },
            } satisfies SendRequestArgs);
        });

        it("should reject the request if the api is not supported", async () => {
            widgetTransportHelper.queueResponse({ supported_versions: [] } as ISupportedVersionsActionResponseData);

            await expect(widgetApi.uploadFile("data")).rejects.toThrow(
                "The upload_file action is not supported by the client.",
            );

            const request = widgetTransportHelper.nextTrackedRequest();
            expect(request).not.toBeUndefined();
            expect(request).not.toEqual({
                action: WidgetApiFromWidgetAction.MSC4039GetMediaConfigAction,
                data: expect.anything(),
            } satisfies SendRequestArgs);
        });

        it("should handle an error", async () => {
            widgetTransportHelper.queueResponse({
                supported_versions: [UnstableApiVersion.MSC4039],
            } as ISupportedVersionsActionResponseData);
            widgetTransportHelper.queueResponse({ error: { message: "An error occurred" } });

            await expect(widgetApi.uploadFile("data")).rejects.toThrow("An error occurred");
        });

        it("should handle an error with details", async () => {
            widgetTransportHelper.queueResponse({
                supported_versions: [UnstableApiVersion.MSC4039],
            } as ISupportedVersionsActionResponseData);

            const errorDetails: IWidgetApiErrorResponseDataDetails = {
                matrix_api_error: {
                    http_status: 400,
                    http_headers: {},
                    url: "",
                    response: {
                        errcode: "M_UNKNOWN",
                        error: "Unknown error",
                    },
                },
            };

            widgetTransportHelper.queueResponse({
                error: {
                    message: "An error occurred",
                    ...errorDetails,
                },
            } as IWidgetApiErrorResponseData);

            await expect(widgetApi.uploadFile("data")).rejects.toThrow(
                new WidgetApiResponseError("An error occurred", errorDetails),
            );
        });
    });

    describe("downloadFile", () => {
        it("should forward the request to the ClientWidgetApi", async () => {
            widgetTransportHelper.queueResponse({
                supported_versions: [UnstableApiVersion.MSC4039],
            } as ISupportedVersionsActionResponseData);
            widgetTransportHelper.queueResponse({ file: "test contents" } as IDownloadFileActionFromWidgetResponseData);

            await expect(widgetApi.downloadFile("mxc://example.com/test_file")).resolves.toEqual({
                file: "test contents",
            });

            expect(widgetTransportHelper.nextTrackedRequest()).not.toBeUndefined();
            expect(widgetTransportHelper.nextTrackedRequest()).toEqual({
                action: WidgetApiFromWidgetAction.MSC4039DownloadFileAction,
                data: { content_uri: "mxc://example.com/test_file" },
            } satisfies SendRequestArgs);
        });

        it("should reject the request if the api is not supported", async () => {
            widgetTransportHelper.queueResponse({ supported_versions: [] } as ISupportedVersionsActionResponseData);

            await expect(widgetApi.downloadFile("mxc://example.com/test_file")).rejects.toThrow(
                "The download_file action is not supported by the client.",
            );

            const request = widgetTransportHelper.nextTrackedRequest();
            expect(request).not.toBeUndefined();
            expect(request).not.toEqual({
                action: WidgetApiFromWidgetAction.MSC4039GetMediaConfigAction,
                data: expect.anything(),
            } satisfies SendRequestArgs);
        });

        it("should handle an error", async () => {
            widgetTransportHelper.queueResponse({
                supported_versions: [UnstableApiVersion.MSC4039],
            } as ISupportedVersionsActionResponseData);
            widgetTransportHelper.queueResponse({ error: { message: "An error occurred" } });

            await expect(widgetApi.downloadFile("mxc://example.com/test_file")).rejects.toThrow("An error occurred");
        });

        it("should handle an error with details", async () => {
            widgetTransportHelper.queueResponse({
                supported_versions: [UnstableApiVersion.MSC4039],
            } as ISupportedVersionsActionResponseData);

            const errorDetails: IWidgetApiErrorResponseDataDetails = {
                matrix_api_error: {
                    http_status: 400,
                    http_headers: {},
                    url: "",
                    response: {
                        errcode: "M_UNKNOWN",
                        error: "Unknown error",
                    },
                },
            };

            widgetTransportHelper.queueResponse({
                error: {
                    message: "An error occurred",
                    ...errorDetails,
                },
            } as IWidgetApiErrorResponseData);

            await expect(widgetApi.downloadFile("mxc://example.com/test_file")).rejects.toThrow(
                new WidgetApiResponseError("An error occurred", errorDetails),
            );
        });
    });

    describe("capabilities", () => {
        it("should request single capability", () => {
            const capability = "org.example.capability";
            widgetApi.requestCapability(capability);
            expect(widgetApi.hasCapability(capability));
        });

        it("should request multiple capability", () => {
            const capabilities: string[] = [];
            for (let i = 1; i <= 3; i++) {
                capabilities.push(`org.example.capability${i}`);
            }
            widgetApi.requestCapabilities(capabilities);
            for (const capability of capabilities) {
                expect(widgetApi.hasCapability(capability));
            }
        });
    });
});

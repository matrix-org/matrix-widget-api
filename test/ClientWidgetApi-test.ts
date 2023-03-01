/*
 * Copyright 2022 Nordeck IT + Consulting GmbH.
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

import { waitFor } from '@testing-library/dom';
import { ClientWidgetApi } from "../src/ClientWidgetApi";
import { WidgetDriver } from "../src/driver/WidgetDriver";
import { UnstableApiVersion } from '../src/interfaces/ApiVersion';
import { Capability } from '../src/interfaces/Capabilities';
import { IRoomEvent } from '../src/interfaces/IRoomEvent';
import { IWidgetApiRequest } from '../src/interfaces/IWidgetApiRequest';
import { IReadRelationsFromWidgetActionRequest } from '../src/interfaces/ReadRelationsAction';
import { ISupportedVersionsActionRequest } from '../src/interfaces/SupportedVersionsAction';
import { IUserDirectorySearchFromWidgetActionRequest } from '../src/interfaces/UserDirectorySearchAction';
import { WidgetApiFromWidgetAction } from '../src/interfaces/WidgetApiAction';
import { WidgetApiDirection } from '../src/interfaces/WidgetApiDirection';
import { Widget } from '../src/models/Widget';
import { PostmessageTransport } from '../src/transport/PostmessageTransport';

jest.mock('../src/transport/PostmessageTransport')

afterEach(() => {
    jest.resetAllMocks();
})

function createRoomEvent(event: Partial<IRoomEvent> = {}): IRoomEvent {
    return {
        type: 'm.room.message',
        sender: 'user-id',
        content: {},
        origin_server_ts: 0,
        event_id: 'id-0',
        room_id: '!room-id',
        unsigned: {},
        ...event,
    };
}

describe('ClientWidgetApi', () => {
    let capabilities: Capability[];
    let iframe: HTMLIFrameElement;
    let driver: jest.Mocked<WidgetDriver>;
    let clientWidgetApi: ClientWidgetApi;
    let transport: PostmessageTransport;
    let emitEvent: Parameters<PostmessageTransport["on"]>["1"];

    async function loadIframe(caps: Capability[] = []) {
        capabilities = caps;

        const ready = new Promise<void>(resolve => {
            clientWidgetApi.once('ready', resolve);
        });

        iframe.dispatchEvent(new Event('load'));

        await ready;
    }

    beforeEach(() => {
        capabilities = [];
        iframe = document.createElement('iframe');
        document.body.appendChild(iframe);

        driver = {
            readEventRelations: jest.fn(),
            validateCapabilities: jest.fn(),
            searchUserDirectory: jest.fn(),
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
        jest.mocked(driver.validateCapabilities).mockImplementation(
            async () => new Set(capabilities),
        );
    });

    afterEach(() => {
        clientWidgetApi.stop();
        iframe.remove();
    });

    it('should initiate capabilities', async () => {
        await loadIframe(['m.always_on_screen']);

        expect(clientWidgetApi.hasCapability('m.always_on_screen')).toBe(true);
        expect(clientWidgetApi.hasCapability('m.sticker')).toBe(false);
    });

    describe('org.matrix.msc3869.read_relations action', () => {
        it('should present as supported api version', () => {
            const event: ISupportedVersionsActionRequest = {
                api: WidgetApiDirection.FromWidget,
                widgetId: 'test',
                requestId: '0',
                action: WidgetApiFromWidgetAction.SupportedApiVersions,
                data: {},
            };

            emitEvent(new CustomEvent('', { detail: event }));

            expect(transport.reply).toBeCalledWith(event, {
                supported_versions: expect.arrayContaining([
                    UnstableApiVersion.MSC3869,
                ]),
            });
        });

        it('should handle and process the request', async () => {
            driver.readEventRelations.mockResolvedValue({
                chunk: [createRoomEvent()],
            });

            const event: IReadRelationsFromWidgetActionRequest = {
                api: WidgetApiDirection.FromWidget,
                widgetId: 'test',
                requestId: '0',
                action: WidgetApiFromWidgetAction.MSC3869ReadRelations,
                data: { event_id: '$event' },
            };

            await loadIframe([
                'org.matrix.msc2762.receive.event:m.room.message',
            ]);

            emitEvent(new CustomEvent('', { detail: event }));

            await waitFor(() => {
                expect(transport.reply).toBeCalledWith(event, {
                    chunk: [createRoomEvent()],
                });
            });

            expect(driver.readEventRelations).toBeCalledWith(
                '$event', undefined, undefined, undefined, undefined, undefined,
                undefined, undefined,
            );
        });

        it('should only return events that match requested capabilities', async () => {
            driver.readEventRelations.mockResolvedValue({
                chunk: [
                    createRoomEvent(),
                    createRoomEvent({ type: 'm.reaction' }),
                    createRoomEvent({ type: 'net.example.test', state_key: 'A' }),
                    createRoomEvent({ type: 'net.example.test', state_key: 'B' }),
                ],
            });

            const event: IReadRelationsFromWidgetActionRequest = {
                api: WidgetApiDirection.FromWidget,
                widgetId: 'test',
                requestId: '0',
                action: WidgetApiFromWidgetAction.MSC3869ReadRelations,
                data: { event_id: '$event' },
            };

            await loadIframe([
                'org.matrix.msc2762.receive.event:m.room.message',
                'org.matrix.msc2762.receive.state_event:net.example.test#A',
            ]);

            emitEvent(new CustomEvent('', { detail: event }));

            await waitFor(() => {
                expect(transport.reply).toBeCalledWith(event, {
                    chunk: [
                        createRoomEvent(),
                        createRoomEvent({ type: 'net.example.test', state_key: 'A' }),
                    ],
                });
            });

            expect(driver.readEventRelations).toBeCalledWith(
                '$event', undefined, undefined, undefined, undefined, undefined,
                undefined, undefined,
            );
        });

        it('should accept all options and pass it to the driver', async () => {
            driver.readEventRelations.mockResolvedValue({
                chunk: [],
            });

            const event: IReadRelationsFromWidgetActionRequest = {
                api: WidgetApiDirection.FromWidget,
                widgetId: 'test',
                requestId: '0',
                action: WidgetApiFromWidgetAction.MSC3869ReadRelations,
                data: {
                    event_id: '$event',
                    room_id: '!room-id',
                    event_type: 'm.room.message',
                    rel_type: 'm.reference',
                    limit: 25,
                    from: 'from-token',
                    to: 'to-token',
                    direction: 'f',
                },
            };

            await loadIframe([
                'org.matrix.msc2762.timeline:!room-id',
            ]);

            emitEvent(new CustomEvent('', { detail: event }));

            await waitFor(() => {
                expect(transport.reply).toBeCalledWith(event, {
                    chunk: [],
                });
            });

            expect(driver.readEventRelations).toBeCalledWith(
                '$event', '!room-id', 'm.reference', 'm.room.message',
                'from-token', 'to-token', 25, 'f',
            );
        });

        it('should reject requests without event_id', async () => {
            const event: IWidgetApiRequest = {
                api: WidgetApiDirection.FromWidget,
                widgetId: 'test',
                requestId: '0',
                action: WidgetApiFromWidgetAction.MSC3869ReadRelations,
                data: {},
            };

            emitEvent(new CustomEvent('', { detail: event }));

            expect(transport.reply).toBeCalledWith(event, {
                error: { message: 'Invalid request - missing event ID' },
            });
        });

        it('should reject requests with a negative limit', async () => {
            const event: IReadRelationsFromWidgetActionRequest = {
                api: WidgetApiDirection.FromWidget,
                widgetId: 'test',
                requestId: '0',
                action: WidgetApiFromWidgetAction.MSC3869ReadRelations,
                data: {
                    event_id: '$event',
                    limit: -1,
                },
            };

            emitEvent(new CustomEvent('', { detail: event }));

            expect(transport.reply).toBeCalledWith(event, {
                error: { message: 'Invalid request - limit out of range' },
            });
        });

        it('should reject requests when the room timeline was not requested', async () => {
            const event: IReadRelationsFromWidgetActionRequest = {
                api: WidgetApiDirection.FromWidget,
                widgetId: 'test',
                requestId: '0',
                action: WidgetApiFromWidgetAction.MSC3869ReadRelations,
                data: {
                    event_id: '$event',
                    room_id: '!another-room-id',
                },
            };

            emitEvent(new CustomEvent('', { detail: event }));

            expect(transport.reply).toBeCalledWith(event, {
                error: { message: 'Unable to access room timeline: !another-room-id' },
            });
        });

        it('should reject requests when the driver throws an exception', async () => {
            driver.readEventRelations.mockRejectedValue(
                new Error("M_FORBIDDEN: You don't have permission to access that event"),
            );

            const event: IReadRelationsFromWidgetActionRequest = {
                api: WidgetApiDirection.FromWidget,
                widgetId: 'test',
                requestId: '0',
                action: WidgetApiFromWidgetAction.MSC3869ReadRelations,
                data: { event_id: '$event' },
            };

            await loadIframe();

            emitEvent(new CustomEvent('', { detail: event }));

            await waitFor(() => {
                expect(transport.reply).toBeCalledWith(event, {
                    error: { message: 'Unexpected error while reading relations' },
                });
            });
        });
    });

    describe('org.matrix.msc3973.user_directory_search action', () => {
        it('should present as supported api version', () => {
            const event: ISupportedVersionsActionRequest = {
                api: WidgetApiDirection.FromWidget,
                widgetId: 'test',
                requestId: '0',
                action: WidgetApiFromWidgetAction.SupportedApiVersions,
                data: {},
            };

            emitEvent(new CustomEvent('', { detail: event }));

            expect(transport.reply).toBeCalledWith(event, {
                supported_versions: expect.arrayContaining([
                    UnstableApiVersion.MSC3973,
                ]),
            });
        });

        it('should handle and process the request', async () => {
            driver.searchUserDirectory.mockResolvedValue({
                limited: true,
                results: [{
                    userId: '@foo:bar.com',
                }],
            });

            const event: IUserDirectorySearchFromWidgetActionRequest = {
                api: WidgetApiDirection.FromWidget,
                widgetId: 'test',
                requestId: '0',
                action: WidgetApiFromWidgetAction.MSC3973UserDirectorySearch,
                data: { search_term: 'foo' },
            };

            await loadIframe([
                'org.matrix.msc3973.user_directory_search',
            ]);

            emitEvent(new CustomEvent('', { detail: event }));

            await waitFor(() => {
                expect(transport.reply).toBeCalledWith(event, {
                    limited: true,
                    results: [{
                        user_id: '@foo:bar.com',
                        display_name: undefined,
                        avatar_url: undefined,
                    }],
                });
            });

            expect(driver.searchUserDirectory).toBeCalledWith('foo', undefined);
        });

        it('should accept all options and pass it to the driver', async () => {
            driver.searchUserDirectory.mockResolvedValue({
                limited: false,
                results: [
                    {
                        userId: '@foo:bar.com',
                    },
                    {
                        userId: '@bar:foo.com',
                        displayName: 'Bar',
                        avatarUrl: 'mxc://...',
                    },
                ],
            });

            const event: IUserDirectorySearchFromWidgetActionRequest = {
                api: WidgetApiDirection.FromWidget,
                widgetId: 'test',
                requestId: '0',
                action: WidgetApiFromWidgetAction.MSC3973UserDirectorySearch,
                data: {
                    search_term: 'foo',
                    limit: 5,
                },
            };

            await loadIframe([
                'org.matrix.msc3973.user_directory_search',
            ]);

            emitEvent(new CustomEvent('', { detail: event }));

            await waitFor(() => {
                expect(transport.reply).toBeCalledWith(event, {
                    limited: false,
                    results: [
                        {
                            user_id: '@foo:bar.com',
                            display_name: undefined,
                            avatar_url: undefined,
                        },
                        {
                            user_id: '@bar:foo.com',
                            display_name: 'Bar',
                            avatar_url: 'mxc://...',
                        },
                    ],
                });
            });

            expect(driver.searchUserDirectory).toBeCalledWith('foo', 5);
        });

        it('should accept empty search_term', async () => {
            driver.searchUserDirectory.mockResolvedValue({
                limited: false,
                results: [],
            });

            const event: IUserDirectorySearchFromWidgetActionRequest = {
                api: WidgetApiDirection.FromWidget,
                widgetId: 'test',
                requestId: '0',
                action: WidgetApiFromWidgetAction.MSC3973UserDirectorySearch,
                data: { search_term: '' },
            };

            await loadIframe([
                'org.matrix.msc3973.user_directory_search',
            ]);

            emitEvent(new CustomEvent('', { detail: event }));

            await waitFor(() => {
                expect(transport.reply).toBeCalledWith(event, {
                    limited: false,
                    results: [],
                });
            });

            expect(driver.searchUserDirectory).toBeCalledWith('', undefined);
        });

        it('should reject requests when the capability was not requested', async () => {
            const event: IUserDirectorySearchFromWidgetActionRequest = {
                api: WidgetApiDirection.FromWidget,
                widgetId: 'test',
                requestId: '0',
                action: WidgetApiFromWidgetAction.MSC3973UserDirectorySearch,
                data: { search_term: 'foo' },
            };

            emitEvent(new CustomEvent('', { detail: event }));

            expect(transport.reply).toBeCalledWith(event, {
                error: { message: 'Missing capability' },
            });

            expect(driver.searchUserDirectory).not.toBeCalled();
        });

        it('should reject requests without search_term', async () => {
            const event: IWidgetApiRequest = {
                api: WidgetApiDirection.FromWidget,
                widgetId: 'test',
                requestId: '0',
                action: WidgetApiFromWidgetAction.MSC3973UserDirectorySearch,
                data: {},
            };

            await loadIframe([
                'org.matrix.msc3973.user_directory_search',
            ]);

            emitEvent(new CustomEvent('', { detail: event }));

            expect(transport.reply).toBeCalledWith(event, {
                error: { message: 'Invalid request - missing search term' },
            });

            expect(driver.searchUserDirectory).not.toBeCalled();
        });

        it('should reject requests with a negative limit', async () => {
            const event: IUserDirectorySearchFromWidgetActionRequest = {
                api: WidgetApiDirection.FromWidget,
                widgetId: 'test',
                requestId: '0',
                action: WidgetApiFromWidgetAction.MSC3973UserDirectorySearch,
                data: {
                    search_term: 'foo',
                    limit: -1,
                },
            };

            await loadIframe([
                'org.matrix.msc3973.user_directory_search',
            ]);

            emitEvent(new CustomEvent('', { detail: event }));

            expect(transport.reply).toBeCalledWith(event, {
                error: { message: 'Invalid request - limit out of range' },
            });

            expect(driver.searchUserDirectory).not.toBeCalled();
        });

        it('should reject requests when the driver throws an exception', async () => {
            driver.searchUserDirectory.mockRejectedValue(
                new Error("M_LIMIT_EXCEEDED: Too many requests"),
            );

            const event: IUserDirectorySearchFromWidgetActionRequest = {
                api: WidgetApiDirection.FromWidget,
                widgetId: 'test',
                requestId: '0',
                action: WidgetApiFromWidgetAction.MSC3973UserDirectorySearch,
                data: { search_term: 'foo' },
            };

            await loadIframe([
                'org.matrix.msc3973.user_directory_search',
            ]);

            emitEvent(new CustomEvent('', { detail: event }));

            await waitFor(() => {
                expect(transport.reply).toBeCalledWith(event, {
                    error: { message: 'Unexpected error while searching in the user directory' },
                });
            });
        });
    });
});

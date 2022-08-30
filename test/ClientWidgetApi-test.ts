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
                originalEvent: createRoomEvent(),
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
                    original_event: createRoomEvent(),
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
                originalEvent: createRoomEvent(),
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
                    original_event: createRoomEvent(),
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
                originalEvent: undefined,
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
                    original_event: undefined,
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

        it('should reject requests when the widget misses the capability to receive the room event type', async () => {
            driver.readEventRelations.mockResolvedValue({
                originalEvent: createRoomEvent(),
                chunk: [],
            });

            const event: IReadRelationsFromWidgetActionRequest = {
                api: WidgetApiDirection.FromWidget,
                widgetId: 'test',
                requestId: '0',
                action: WidgetApiFromWidgetAction.MSC3869ReadRelations,
                data: { event_id: '$event' },
            };

            emitEvent(new CustomEvent('', { detail: event }));

            await waitFor(() => {
                expect(transport.reply).toBeCalledWith(event, {
                    error: { message: 'Cannot read room events of this type' },
                });
            });
        });

        it('should reject requests when the widget misses the capability to receive the state event type', async () => {
            driver.readEventRelations.mockResolvedValue({
                originalEvent: createRoomEvent({ state_key: '' }),
                chunk: [],
            });

            const event: IReadRelationsFromWidgetActionRequest = {
                api: WidgetApiDirection.FromWidget,
                widgetId: 'test',
                requestId: '0',
                action: WidgetApiFromWidgetAction.MSC3869ReadRelations,
                data: { event_id: '$event' },
            };

            emitEvent(new CustomEvent('', { detail: event }));

            await waitFor(() => {
                expect(transport.reply).toBeCalledWith(event, {
                    error: { message: 'Cannot read state events of this type' },
                });
            });
        });
    });
});

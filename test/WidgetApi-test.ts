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

import { UnstableApiVersion } from '../src/interfaces/ApiVersion';
import { IReadRelationsFromWidgetResponseData } from '../src/interfaces/ReadRelationsAction';
import { ISupportedVersionsActionResponseData } from '../src/interfaces/SupportedVersionsAction';
import { WidgetApiFromWidgetAction } from '../src/interfaces/WidgetApiAction';
import { PostmessageTransport } from '../src/transport/PostmessageTransport';
import { WidgetApi } from '../src/WidgetApi';

jest.mock('../src/transport/PostmessageTransport')

describe('WidgetApi', () => {
    let widgetApi: WidgetApi;

    beforeEach(() => {
        widgetApi = new WidgetApi()
    });

    afterEach(() => {
        jest.resetAllMocks();
    });

    describe('readEventRelations', () => {
        it('should forward the request to the ClientWidgetApi', async () => {
            jest.mocked(PostmessageTransport.prototype.send).mockResolvedValueOnce(
                { supported_versions: [UnstableApiVersion.MSC3869] } as ISupportedVersionsActionResponseData,
            );
            jest.mocked(PostmessageTransport.prototype.send).mockResolvedValue(
                {
                    chunk: [],
                } as IReadRelationsFromWidgetResponseData,
            );

            await expect(widgetApi.readEventRelations(
                '$event', '!room-id', 'm.reference', 'm.room.message', 25,
                'from-token', 'to-token', 'f',
            )).resolves.toEqual({
                chunk: [],
            });

            expect(PostmessageTransport.prototype.send).toBeCalledWith(WidgetApiFromWidgetAction.MSC3869ReadRelations, {
                event_id: '$event',
                room_id: '!room-id',
                rel_type: 'm.reference',
                event_type: 'm.room.message',
                limit: 25,
                from: 'from-token',
                to: 'to-token',
                direction: 'f',
            });
        });

        it('should reject the request if the api is not supported', async () => {
            jest.mocked(PostmessageTransport.prototype.send).mockResolvedValueOnce(
                { supported_versions: [] } as ISupportedVersionsActionResponseData,
            );

            await expect(widgetApi.readEventRelations(
                '$event', '!room-id', 'm.reference', 'm.room.message', 25,
                'from-token', 'to-token', 'f',
            )).rejects.toThrow("The read_relations action is not supported by the client.");

            expect(PostmessageTransport.prototype.send)
                .not.toBeCalledWith(WidgetApiFromWidgetAction.MSC3869ReadRelations, expect.anything());
        });

        it('should handle an error', async () => {
            jest.mocked(PostmessageTransport.prototype.send).mockResolvedValueOnce(
                { supported_versions: [UnstableApiVersion.MSC3869] } as ISupportedVersionsActionResponseData,
            );
            jest.mocked(PostmessageTransport.prototype.send).mockRejectedValue(
                new Error('An error occurred'),
            );

            await expect(widgetApi.readEventRelations(
                '$event', '!room-id', 'm.reference', 'm.room.message', 25,
                'from-token', 'to-token', 'f',
            )).rejects.toThrow('An error occurred');
        });
    });

    describe('getClientVersions', () => {
        beforeEach(() => {
            jest.mocked(PostmessageTransport.prototype.send).mockResolvedValueOnce(
                {
                    supported_versions: [
                        UnstableApiVersion.MSC3869, UnstableApiVersion.MSC2762,
                    ],
                } as ISupportedVersionsActionResponseData,
            );
        })

        it('should request supported client versions', async () => {
            await expect(widgetApi.getClientVersions()).resolves.toEqual([
                'org.matrix.msc3869', 'org.matrix.msc2762',
            ]);
        })

        it('should cache supported client versions on successive calls', async () => {
            await expect(widgetApi.getClientVersions()).resolves.toEqual([
                'org.matrix.msc3869', 'org.matrix.msc2762',
            ]);

            await expect(widgetApi.getClientVersions()).resolves.toEqual([
                'org.matrix.msc3869', 'org.matrix.msc2762',
            ]);

            expect(PostmessageTransport.prototype.send).toBeCalledTimes(1);
        })
    });
});

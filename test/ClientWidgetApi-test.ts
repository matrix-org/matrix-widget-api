/*
 * Copyright 2022 The Matrix.org Foundation C.I.C.
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

import { ClientWidgetApi } from "../src/ClientWidgetApi";
import { WidgetDriver } from "../src/driver/WidgetDriver";
import { Capability } from '../src/interfaces/Capabilities';
import { Widget } from '../src/models/Widget';
import { PostmessageTransport } from '../src/transport/PostmessageTransport';

jest.mock('../src/transport/PostmessageTransport')

afterEach(() => {
    jest.resetAllMocks();
})

describe('ClientWidgetApi', () => {
    let capabilities: Capability[];
    let iframe: HTMLIFrameElement;
    let driver: jest.Mocked<WidgetDriver>;
    let clientWidgetApi: ClientWidgetApi;
    let transport: PostmessageTransport;

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

        ([transport] = jest.mocked(PostmessageTransport).mock.instances);

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
});

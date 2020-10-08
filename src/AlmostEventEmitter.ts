/*
 * Copyright 2020 The Matrix.org Foundation C.I.C.
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

import { WidgetApiToWidgetAction } from "./interfaces/WidgetApiAction";
import { IWidgetApiRequest } from "../lib";

// because we don't have real EventEmitter support :(
export abstract class AlmostEventEmitter extends EventTarget {
    public once<T extends Event>(event: string, handler: (ev: T) => void) {
        const fn = (ev: T) => {
            try {
                handler(ev);
            } catch (e) {
                console.error("Unhandled once() error: ", e);
            }
            this.removeEventListener(event, fn);
        };
        this.addEventListener(event, fn);
    }

    public onAction(action: WidgetApiToWidgetAction, handler: (ev: CustomEvent<IWidgetApiRequest>) => void) {
        return this.addEventListener(`action:${action}`, handler);
    }

    public offAction(action: WidgetApiToWidgetAction, handler: (ev: CustomEvent<IWidgetApiRequest>) => void) {
        return this.removeEventListener(`action:${action}`, handler);
    }
}

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

import { EnhancedMap } from "./maps";

export interface EventListener<T> {
    (ev: T): void;
}

export class EventEmitter<T = Object> {
    private listeners = new EnhancedMap<string, EventListener<T>[]>();

    /**
     * Emits an event. Not guranteed to be sync.
     * @param {string} eventName The event name.
     * @param {T} ev The event payload (optional).
     * @protected
     */
    protected emit(eventName: string, ev: T = null) {
        const listeners = this.listeners.get(eventName);
        if (!listeners) return;

        for (const listener of listeners) {
            try {
                listener(ev);
            } catch (e) {
                console.error(`Error raising event '${eventName}': `, e);
            }
        }
    }

    public on(eventName: string, cb: EventListener<T>) {
        this.listeners.getOrCreate(eventName, []).push(cb);
    }

    public off(eventName: string, cb: EventListener<T>) {
        const listeners = this.listeners.getOrCreate(eventName, []);
        const idx = listeners.indexOf(cb);
        if (idx >= 0) listeners.splice(idx, 1);
    }

    public once(eventName: string, cb: EventListener<T>) {
        let called = false;
        const wrapFn: EventListener<T> = (ev: T) => {
            if (called) return;
            called = true;
            this.off(eventName, wrapFn);
            cb(ev);
        };
        this.on(eventName, wrapFn);
    }
}


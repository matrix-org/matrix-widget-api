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

export type ObservableFunction<T> = (val: T) => void;

export class SimpleObservable<T> {
    private listeners: ObservableFunction<T>[] = [];

    public constructor(initialFn?: ObservableFunction<T>) {
        if (initialFn) this.listeners.push(initialFn);
    }

    public onUpdate(fn: ObservableFunction<T>): void {
        this.listeners.push(fn);
    }

    public update(val: T): void {
        for (const listener of this.listeners) {
            listener(val);
        }
    }

    public close(): void {
        this.listeners = []; // reset
    }
}

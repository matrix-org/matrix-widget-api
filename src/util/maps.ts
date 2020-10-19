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

/**
 * A Map<K, V> with added utility.
 */
export class EnhancedMap<K, V> extends Map<K, V> {
    public constructor(entries?: Iterable<[K, V]>) {
        super(entries);
    }

    public getOrCreate(key: K, def: V): V {
        if (this.has(key)) {
            return this.get(key);
        }
        this.set(key, def);
        return def;
    }

    public remove(key: K): V {
        const v = this.get(key);
        this.delete(key);
        return v;
    }
}

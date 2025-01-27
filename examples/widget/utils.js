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

function parseFragment() {
    const fragmentString = window.location.hash || "?";
    return new URLSearchParams(fragmentString.substring(Math.max(fragmentString.indexOf("?"), 0)));
}

function assertParam(fragment, name) {
    const val = fragment.get(name);
    if (!val) throw new Error(`${name} is not present in URL - cannot load widget`);
    return val;
}

function handleError(e) {
    console.error(e);
    document.getElementById("container").innerText = "There was an error with the widget. See JS console for details.";
}

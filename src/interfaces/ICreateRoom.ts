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

/**
 * The body of the `create_room` action.
 */
export interface ICreateRoom {
    /**
     * Extra keys to be added to the content of the `m.room.create` event. The server will overwrite
     * the following keys: `creator`, `room_version`.
     */
    creation_content?: Record<string, unknown>; // eslint-disable-line camelcase

    /**
     * A list of state events to set in the new room. Takes precedence over events sent by `preset`,
     * but gets overridden by `name` and `topic`.
     */
    initial_state?: PartialStateEvent[]; // eslint-disable-line camelcase

    /**
     * A list of user IDs to invite to the room.
     */
    invite?: string[];

    /**
     * A list of objects representing third party IDs to invite into the room.
     */
    invite_3pid?: Array<{ // eslint-disable-line camelcase
        address: string;
        id_access_token: string; // eslint-disable-line camelcase
        id_server: string; // eslint-disable-line camelcase
        medium: string;
    }>;

    /**
     * The flag makes the server set the `is_direct` flag on the `m.room.member` events sent to the
     * users in `invite` and `invite_3pid`.
     */
    is_direct?: boolean, // eslint-disable-line camelcase

    /**
     * If included, an `m.room.name` event will be sent into the room to indicate the name of the
     * room.
     */
    name?: string,

    /**
     * The power level content to override in the default power level event. This object is applied
     * on top of the generated `m.room.power_levels` event content prior to it being sent to the room.
     * Defaults to overriding nothing.
     */
    power_level_content_override?: PowerLevelsEventContent, // eslint-disable-line camelcase

    /**
     * Convenience parameter setting various default state events based on a preset.
     *
     * If unspecified, the server should use the `visibility` to determine which preset to use.
     */
    preset?: 'private_chat' | 'trusted_private_chat' | 'public_chat',

    /**
     * The desired room alias **local part**.
     */
    room_alias_name?: string, // eslint-disable-line camelcase

    /**
     * The room version to set for the room. If not provided, the homeserver is to use its configured
     * default.
     */
    room_version?: string, // eslint-disable-line camelcase

    /**
     * If this is included, an `m.room.topic` event will be sent into the room to indicate the topic
     * for the room.
     */
    topic?: string,

    /**
     * A `public` visibility indicates that the room will be shown in the published room list. A
     * `private` visibility will hide the room from the published room list. Rooms default to
     * `private` visibility if this key is not included.
     */
    visibility?: 'public' | 'private',
}

/**
 * A state event that is used to define the initial state of a newly created room.
 */
export interface PartialStateEvent {
    type: string;
    content: unknown;
    state_key: string; // eslint-disable-line camelcase
}

/**
 * The content definition for m.room.power_levels events
 * @category Matrix event contents
 * @see PowerLevelsEvent
 */
export interface PowerLevelsEventContent {
    /**
     * The power level required to ban. Default 50.
     */
    ban?: number;
    /**
     * A map of event types to the power level required to send them.
     */
    events?: {
        [eventType: string]: number;
    };
    /**
     * The power level required to send events in the room. Default 50.
     */
    events_default?: number; // eslint-disable-line camelcase
    /**
     * The power level required to invite users to the room. Default 50.
     */
    invite?: number;
    /**
     * The power level required to kick users from the room. Default 50.
     */
    kick?: number;
    /**
     * The power level required to redact other people's events in the room. Default 50.
     */
    redact?: number;
    /**
     * The power level required to send state events in the room. Default 50.
     */
    state_default?: number; // eslint-disable-line camelcase
    /**
     * A map of user IDs to power levels.
     */
    users?: {
        [userId: string]: number;
    };
    /**
     * The power level of users not listed in `users`. Default 0.
     */
    users_default?: number; // eslint-disable-line camelcase
    /**
     * Power levels required to send certain kinds of notifications.
     */
    notifications?: {
        /**
         * The power level required to send "@room" notifications. Default 50.
         */
        room?: number;
    };
}

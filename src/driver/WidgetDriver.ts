/*
 * Copyright 2020 - 2024 The Matrix.org Foundation C.I.C.
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

import {
    Capability,
    IOpenIDCredentials,
    OpenIDRequestState,
    SimpleObservable,
    IRoomEvent,
    IRoomAccountData,
    ITurnServer,
    IWidgetApiErrorResponseDataDetails,
    UpdateDelayedEventAction,
} from "..";

export interface ISendEventDetails {
    roomId: string;
    eventId: string;
}

export interface ISendDelayedEventDetails {
    roomId: string;
    delayId: string;
}

export interface IOpenIDUpdate {
    state: OpenIDRequestState;
    token?: IOpenIDCredentials;
}

export interface IReadEventRelationsResult {
    chunk: IRoomEvent[];
    nextBatch?: string;
    prevBatch?: string;
}

export interface ISearchUserDirectoryResult {
    limited: boolean;
    results: Array<{
        userId: string;
        displayName?: string;
        avatarUrl?: string;
    }>;
}

export interface IGetMediaConfigResult {
    [key: string]: unknown;
    "m.upload.size"?: number;
}

/**
 * Represents the functions and behaviour the widget-api is unable to
 * do, such as prompting the user for information or interacting with
 * the UI. Clients are expected to implement this class and override
 * any functions they need/want to support.
 *
 * This class assumes the client will have a context of a Widget
 * instance already.
 */
export abstract class WidgetDriver {
    /**
     * Verifies the widget's requested capabilities, returning the ones
     * it is approved to use. Mutating the requested capabilities will
     * have no effect.
     *
     * This SHOULD result in the user being prompted to approve/deny
     * capabilities.
     *
     * By default this rejects all capabilities (returns an empty set).
     * @param {Set<Capability>} requested The set of requested capabilities.
     * @returns {Promise<Set<Capability>>} Resolves to the allowed capabilities.
     */
    public validateCapabilities(requested: Set<Capability>): Promise<Set<Capability>> {
        return Promise.resolve(new Set());
    }

    /**
     * Sends an event into a room. If `roomId` is falsy, the client should send the event
     * into the room the user is currently looking at. The widget API will have already
     * verified that the widget is capable of sending the event to that room.
     * @param {string} eventType The event type to be sent.
     * @param {*} content The content for the event.
     * @param {string|null} stateKey The state key if this is a state event, otherwise null.
     * May be an empty string.
     * @param {string|null} roomId The room ID to send the event to. If falsy, the room the
     * user is currently looking at.
     * @returns {Promise<ISendEventDetails>} Resolves when the event has been sent with
     * details of that event.
     * @throws Rejected when the event could not be sent.
     */
    public sendEvent(
        eventType: string,
        content: unknown,
        stateKey: string | null = null,
        roomId: string | null = null,
    ): Promise<ISendEventDetails> {
        return Promise.reject(new Error("Failed to override function"));
    }

    /**
     * @experimental Part of MSC4140 & MSC4157
     * Sends a delayed event into a room. If `roomId` is falsy, the client should send it
     * into the room the user is currently looking at. The widget API will have already
     * verified that the widget is capable of sending the event to that room.
     * @param {number|null} delay How much later to send the event, or null to not send the
     * event automatically. May not be null if {@link parentDelayId} is null.
     * @param {string|null} parentDelayId The ID of the delayed event this one is grouped with,
     * or null if it will be put in a new group. May not be null if {@link delay} is null.
     * @param {string} eventType The event type of the event to be sent.
     * @param {*} content The content for the event to be sent.
     * @param {string|null} stateKey The state key if the event to be sent a state event,
     * otherwise null. May be an empty string.
     * @param {string|null} roomId The room ID to send the event to. If falsy, the room the
     * user is currently looking at.
     * @returns {Promise<ISendDelayedEventDetails>} Resolves when the delayed event has been
     * prepared with details of how to refer to it for updating/sending/canceling it later.
     * @throws Rejected when the delayed event could not be sent.
     */
    public sendDelayedEvent(
        delay: number | null,
        parentDelayId: string | null,
        eventType: string,
        content: unknown,
        stateKey: string | null = null,
        roomId: string | null = null,
    ): Promise<ISendDelayedEventDetails> {
        return Promise.reject(new Error("Failed to override function"));
    }

    /**
     * @experimental Part of MSC4140 & MSC4157
     * Run the specified {@link action} for the delayed event matching the provided {@link delayId}.
     * @throws Rejected when there is no matching delayed event, or when the action failed to run.
     */
    public updateDelayedEvent(delayId: string, action: UpdateDelayedEventAction): Promise<void> {
        return Promise.reject(new Error("Failed to override function"));
    }

    /**
     * Sends a to-device event. The widget API will have already verified that the widget
     * is capable of sending the event.
     * @param {string} eventType The event type to be sent.
     * @param {boolean} encrypted Whether to encrypt the message contents.
     * @param {Object} contentMap A map from user ID and device ID to event content.
     * @returns {Promise<void>} Resolves when the event has been sent.
     * @throws Rejected when the event could not be sent.
     */
    public sendToDevice(
        eventType: string,
        encrypted: boolean,
        contentMap: { [userId: string]: { [deviceId: string]: object } },
    ): Promise<void> {
        return Promise.reject(new Error("Failed to override function"));
    }
    /**
     * Reads an element of room account data. The widget API will have already verified that the widget is
     * capable of receiving the `eventType` of the requested information. If `roomIds` is supplied, it may
     * contain `Symbols.AnyRoom` to denote that the piece of room account data in each of the client's known
     * rooms should be returned. When `null`, only the room the user is currently looking at should be considered.
     * @param eventType The event type to be read.
     * @param roomIds When null, the user's currently viewed room. Otherwise, the list of room IDs
     * to look within, possibly containing Symbols.AnyRoom to denote all known rooms.
     * @returns {Promise<IRoomAccountData[]>} Resolves to the element of room account data, or an empty array.
     */
    public readRoomAccountData(eventType: string, roomIds: string[] | null = null): Promise<IRoomAccountData[]> {
        return Promise.resolve([]);
    }

    /**
     * Reads all events of the given type, and optionally `msgtype` (if applicable/defined),
     * the user has access to. The widget API will have already verified that the widget is
     * capable of receiving the events. Less events than the limit are allowed to be returned,
     * but not more. If `roomIds` is supplied, it may contain `Symbols.AnyRoom` to denote that
     * `limit` in each of the client's known rooms should be returned. When `null`, only the
     * room the user is currently looking at should be considered. If `since` is specified but
     * the event ID isn't present in the number of events fetched by the client due to `limit`,
     * the client will return all the events.
     * @param eventType The event type to be read.
     * @param msgtype The msgtype of the events to be read, if applicable/defined.
     * @param stateKey The state key of the events to be read, if applicable/defined.
     * @param limit The maximum number of events to retrieve per room. Will be zero to denote "as many
     * as possible".
     * @param roomIds When null, the user's currently viewed room. Otherwise, the list of room IDs
     * to look within, possibly containing Symbols.AnyRoom to denote all known rooms.
     * @param since When null, retrieves the number of events specified by the "limit" parameter.
     * Otherwise, the event ID at which only subsequent events will be returned, as many as specified
     * in "limit".
     * @returns {Promise<IRoomEvent[]>} Resolves to the room events, or an empty array.
     * @deprecated Clients are advised to implement {@link WidgetDriver.readRoomTimeline} instead.
     */
    public readRoomEvents(
        eventType: string,
        msgtype: string | undefined,
        limit: number,
        roomIds: string[] | null = null,
        since?: string,
    ): Promise<IRoomEvent[]> {
        return Promise.resolve([]);
    }

    /**
     * Reads all events of the given type, and optionally state key (if applicable/defined),
     * the user has access to. The widget API will have already verified that the widget is
     * capable of receiving the events. Less events than the limit are allowed to be returned,
     * but not more. If `roomIds` is supplied, it may contain `Symbols.AnyRoom` to denote that
     * `limit` in each of the client's known rooms should be returned. When `null`, only the
     * room the user is currently looking at should be considered.
     * @param eventType The event type to be read.
     * @param stateKey The state key of the events to be read, if applicable/defined.
     * @param limit The maximum number of events to retrieve. Will be zero to denote "as many
     * as possible".
     * @param roomIds When null, the user's currently viewed room. Otherwise, the list of room IDs
     * to look within, possibly containing Symbols.AnyRoom to denote all known rooms.
     * @returns {Promise<IRoomEvent[]>} Resolves to the state events, or an empty array.
     * @deprecated Clients are advised to implement {@link WidgetDriver.readRoomTimeline} instead.
     */
    public readStateEvents(
        eventType: string,
        stateKey: string | undefined,
        limit: number,
        roomIds: string[] | null = null,
    ): Promise<IRoomEvent[]> {
        return Promise.resolve([]);
    }

    /**
     * Reads all events of the given type, and optionally `msgtype` (if applicable/defined),
     * the user has access to. The widget API will have already verified that the widget is
     * capable of receiving the events. Less events than the limit are allowed to be returned,
     * but not more.
     * @param roomId The ID of the room to look within.
     * @param eventType The event type to be read.
     * @param msgtype The msgtype of the events to be read, if applicable/defined.
     * @param stateKey The state key of the events to be read, if applicable/defined.
     * @param limit The maximum number of events to retrieve. Will be zero to denote "as many as
     * possible".
     * @param since When null, retrieves the number of events specified by the "limit" parameter.
     * Otherwise, the event ID at which only subsequent events will be returned, as many as specified
     * in "limit".
     * @returns {Promise<IRoomEvent[]>} Resolves to the room events, or an empty array.
     */
    public readRoomTimeline(
        roomId: string,
        eventType: string,
        msgtype: string | undefined,
        stateKey: string | undefined,
        limit: number,
        since: string | undefined,
    ): Promise<IRoomEvent[]> {
        // For backward compatibility we try the deprecated methods, in case
        // they're implemented
        if (stateKey === undefined) return this.readRoomEvents(eventType, msgtype, limit, [roomId], since);
        else return this.readStateEvents(eventType, stateKey, limit, [roomId]);
    }

    /**
     * Reads the current values of all matching room state entries.
     * @param roomId The ID of the room.
     * @param eventType The event type of the entries to be read.
     * @param stateKey The state key of the entry to be read. If undefined,
     * all room state entries with a matching event type should be returned.
     * @returns {Promise<IRoomEvent[]>} Resolves to the events representing the
     * current values of the room state entries.
     */
    public readRoomState(roomId: string, eventType: string, stateKey: string | undefined): Promise<IRoomEvent[]> {
        return this.readStateEvents(eventType, stateKey, Number.MAX_SAFE_INTEGER, [roomId]);
    }

    /**
     * Reads all events that are related to a given event. The widget API will
     * have already verified that the widget is capable of receiving the event,
     * or will make sure to reject access to events which are returned from this
     * function, but are not capable of receiving. If `relationType` or `eventType`
     * are set, the returned events should already be filtered. Less events than
     * the limit are allowed to be returned, but not more.
     * @param eventId The id of the parent event to be read.
     * @param roomId The room to look within. When undefined, the user's
     * currently viewed room.
     * @param relationType The relationship type of child events to search for.
     * When undefined, all relations are returned.
     * @param eventType The event type of child events to search for. When undefined,
     * all related events are returned.
     * @param from The pagination token to start returning results from, as
     * received from a previous call. If not supplied, results start at the most
     * recent topological event known to the server.
     * @param to The pagination token to stop returning results at. If not
     * supplied, results continue up to limit or until there are no more events.
     * @param limit The maximum number of events to retrieve per room. If not
     * supplied, the server will apply a default limit.
     * @param direction The direction to search for according to MSC3715
     * @returns Resolves to the room relations.
     */
    public readEventRelations(
        eventId: string,
        roomId?: string,
        relationType?: string,
        eventType?: string,
        from?: string,
        to?: string,
        limit?: number,
        direction?: "f" | "b",
    ): Promise<IReadEventRelationsResult> {
        return Promise.resolve({ chunk: [] });
    }

    /**
     * Asks the user for permission to validate their identity through OpenID Connect. The
     * interface for this function is an observable which accepts the state machine of the
     * OIDC exchange flow. For example, if the client/user blocks the request then it would
     * feed back a `{state: Blocked}` into the observable. Similarly, if the user already
     * approved the widget then a `{state: Allowed}` would be fed into the observable alongside
     * the token itself. If the client is asking for permission, it should feed in a
     * `{state: PendingUserConfirmation}` followed by the relevant Allowed or Blocked state.
     *
     * The widget API will reject the widget's request with an error if this contract is not
     * met properly. By default, the widget driver will block all OIDC requests.
     * @param {SimpleObservable<IOpenIDUpdate>} observer The observable to feed updates into.
     */
    public askOpenID(observer: SimpleObservable<IOpenIDUpdate>): void {
        observer.update({ state: OpenIDRequestState.Blocked });
    }

    /**
     * Navigates the client with a matrix.to URI. In future this function will also be provided
     * with the Matrix URIs once matrix.to is replaced. The given URI will have already been
     * lightly checked to ensure it looks like a valid URI, though the implementation is recommended
     * to do further checks on the URI.
     * @param {string} uri The URI to navigate to.
     * @returns {Promise<void>} Resolves when complete.
     * @throws Throws if there's a problem with the navigation, such as invalid format.
     */
    public navigate(uri: string): Promise<void> {
        throw new Error("Navigation is not implemented");
    }

    /**
     * Polls for TURN server data, yielding an initial set of credentials as soon as possible, and
     * thereafter yielding new credentials whenever the previous ones expire. The widget API will
     * have already verified that the widget has permission to access TURN servers.
     * @yields {ITurnServer} The TURN server URIs and credentials currently available to the client.
     */
    public getTurnServers(): AsyncGenerator<ITurnServer> {
        throw new Error("TURN server support is not implemented");
    }

    /**
     * Search for users in the user directory.
     * @param searchTerm The term to search for.
     * @param limit The maximum number of results to return. If not supplied, the
     * @returns Resolves to the search results.
     */
    public searchUserDirectory(searchTerm: string, limit?: number): Promise<ISearchUserDirectoryResult> {
        return Promise.resolve({ limited: false, results: [] });
    }

    /**
     * Get the config for the media repository.
     * @returns Promise which resolves with an object containing the config.
     */
    public getMediaConfig(): Promise<IGetMediaConfigResult> {
        throw new Error("Get media config is not implemented");
    }

    /**
     * Upload a file to the media repository on the homeserver.
     * @param file - The object to upload. Something that can be sent to
     *               XMLHttpRequest.send (typically a File).
     * @returns Resolves to the location of the uploaded file.
     */
    public uploadFile(file: XMLHttpRequestBodyInit): Promise<{ contentUri: string }> {
        throw new Error("Upload file is not implemented");
    }

    /**
     * Download a file from the media repository on the homeserver.
     * @param contentUri - MXC URI of the file to download.
     * @returns Resolves to the contents of the file.
     */
    public downloadFile(contentUri: string): Promise<{ file: XMLHttpRequestBodyInit }> {
        throw new Error("Download file is not implemented");
    }

    /**
     * Gets the IDs of all joined or invited rooms currently known to the
     * client.
     * @returns The room IDs.
     */
    public getKnownRooms(): string[] {
        throw new Error("Querying known rooms is not implemented");
    }

    /**
     * Expresses an error thrown by this driver in a format compatible with the Widget API.
     * @param error The error to handle.
     * @returns The error expressed as a {@link IWidgetApiErrorResponseDataDetails},
     * or undefined if it cannot be expressed as one.
     */
    public processError(error: unknown): IWidgetApiErrorResponseDataDetails | undefined {
        return undefined;
    }
}

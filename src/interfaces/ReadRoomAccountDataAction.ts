import { IWidgetApiRequest, IWidgetApiRequestData } from "./IWidgetApiRequest";
import { WidgetApiFromWidgetAction } from "./WidgetApiAction";
import { IWidgetApiResponseData } from "./IWidgetApiResponse";
import { IRoomAccountData } from "./IRoomAccountData";
import { Symbols } from "../Symbols";

export interface IReadRoomAccountDataFromWidgetRequestData extends IWidgetApiRequestData {
    type: string;
    room_ids?: Symbols.AnyRoom | string[]; // eslint-disable-line camelcase
}

export interface IReadRoomAccountDataFromWidgetActionRequest extends IWidgetApiRequest {
    action: WidgetApiFromWidgetAction.BeeperReadRoomAccountData;
    data: IReadRoomAccountDataFromWidgetRequestData;
}

export interface IReadRoomAccountDataFromWidgetResponseData extends IWidgetApiResponseData {
    events: IRoomAccountData[];
}

export interface IReadRoomAccountDataFromWidgetActionResponse extends IReadRoomAccountDataFromWidgetActionRequest {
    response: IReadRoomAccountDataFromWidgetResponseData;
}

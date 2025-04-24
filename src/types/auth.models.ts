import { RecordID } from "./recordID.models";
import { BaseResponse } from "./response.models";

export interface LoginResponse extends BaseResponse {
    tkn: string;
}

export interface PermissionResponse extends BaseResponse {
    permission: boolean;
}

export interface User {
    id?: RecordID;
    firstName: string;
    lastName: string;
    username: string;
    email: string;
    password: string
    number: string;
    createdDt?: string;
    userImage: string | ArrayBuffer | null;
    group_ids?: string[];
};

export interface Group {
    id?: RecordID;
    features?: {
        name: string;
        action: string;
        domain: string;
        scope: string;
    }[];
    name: string;
    user_ids: RecordID[];
};

export interface ActionResponse extends BaseResponse {
    action: "read" | "read-write" | ""
}

export type Action = "read" | "read-write" 
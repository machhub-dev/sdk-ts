import { RecordID } from "./recordID.models";

export interface BaseResponse {
    success: boolean;
}

export interface LoginResponse extends BaseResponse {
    tkn: string;
    message: string;
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
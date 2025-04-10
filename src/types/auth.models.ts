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
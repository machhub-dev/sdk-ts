import { RecordID } from "./recordID.models.js";
import { BaseResponse } from "./response.models.js";

export interface LoginResponse extends BaseResponse {
    tkn: string;
}

export interface PermissionResponse extends BaseResponse {
    permission: boolean;
}

export interface ValidateJWTResponse extends BaseResponse {
    valid: boolean;
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

export interface Feature {
    name:string
    action:string
    scope:Scope
}

export interface Permission {
    displayName:string;
    description:string;
    name: string;
    action: string;
    scope: string;
}

export function machhubPermissions(): Permission[]{
    return [
		{
			displayName: 'Applications',
			description: 'View or manage applications all applications in MACHHUB',
			name: 'applications',
			action: 'nil',
			scope: 'all'
		},
		{
			displayName: 'Users',
			description: 'View or manage user accounts in this domain',
			name: 'users',
			action: 'nil',
			scope: 'domain'
		},
		{
			displayName: 'Groups',
			description: 'View or manage user groups in this domain',
			name: 'groups',
			action: 'nil',
			scope: 'domain'
		},
		{
			displayName: 'Manage Own API Keys',
			description: 'View or manage API keys for own account',
			name: 'api_keys',
			action: 'nil',
			scope: 'self'
		},
		{
			displayName: 'Manage All API Keys',
			description: 'View or manage all API keys in MACHHUB',
			name: 'api_keys',
			action: 'nil',
			scope: 'all'
		},
		{
			displayName: 'Upstreams',
			description: 'View or manage all upstream configurations in MACHHUB',
			name: 'upstreams',
			action: 'nil',
			scope: 'domain'
		},
		{
			displayName: 'Manage Namespace',
			description: 'View or manage namespaces in this domain',
			name: 'namespace',
			action: 'nil',
			scope: 'domain'
		},
		{
			displayName: 'Historian',
			description: 'View or manage historian data in this domain',
			name: 'historian',
			action: 'nil',
			scope: 'domain'
		},
		{
			displayName: 'Collections',
			description: 'View or manage collections in this domain',
			name: 'collections',
			action: 'nil',
			scope: 'domain'
		},
		{
			displayName: 'Logs',
			description: 'View or manage system logs',
			name: 'logs',
			action: 'nil',
			scope: 'all'
		},
		{
			displayName: 'General Settings',
			description: 'View or manage general system settings',
			name: 'general_settings',
			action: 'nil',
			scope: 'all'
		},
		{
			displayName: 'Gateway Settings',
			description: 'View or manage gateway settings',
			name: 'gateway',
			action: 'nil',
			scope: 'all'
		},
		{
			displayName: 'License',
			description: 'View or manage MACHHUB licensing details',
			name: 'license',
			action: 'nil',
			scope: 'all'
		}
	]
}

export interface ActionResponse extends BaseResponse {
    action: "read" | "read-write" | ""
}

export type Action = "read" | "read-write" 
export type Scope = "self" |  "domain" | "all"| "nil" 
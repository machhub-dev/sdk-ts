import { HTTPService } from "../services/http.service.js";
import { jwtDecode } from "jwt-decode";
import { Action, ActionResponse, ChangePasswordResponse, Feature, Group, LoginResponse, PermissionResponse, ResetPasswordResponse, SuccessResponse, UpdateUserInput, User, ValidateJWTResponse } from "../types/auth.models.js";

export class Auth {
  private httpService: HTTPService;
  private applicationID: string;
  private readonly AUTH_TOKEN_KEY_PREFIX = "x-machhub-auth-tkn";

  // In-memory fallback for environments without localStorage (e.g. Node.js)
  private static memoryStore: Map<string, string> = new Map();

  constructor(httpService: HTTPService, applicationID: string) {
    this.httpService = httpService;
    this.applicationID = applicationID;
  }

  private getStorageKey(): string {
    return this.applicationID
      ? `${this.AUTH_TOKEN_KEY_PREFIX}-${this.applicationID}`
      : this.AUTH_TOKEN_KEY_PREFIX;
  }

  private storageGet(key: string): string | null {
    if (typeof localStorage !== 'undefined' && typeof localStorage.getItem === 'function') return localStorage.getItem(key);
    return Auth.memoryStore.get(key) ?? null;
  }

  private storageSet(key: string, value: string): void {
    if (typeof localStorage !== 'undefined' && typeof localStorage.setItem === 'function') { localStorage.setItem(key, value); return; }
    Auth.memoryStore.set(key, value);
  }

  private storageRemove(key: string): void {
    if (typeof localStorage !== 'undefined' && typeof localStorage.removeItem === 'function') { localStorage.removeItem(key); return; }
    Auth.memoryStore.delete(key);
  }

  public async login(username: string, password: string): Promise<LoginResponse | undefined> {
    try {
      const res: LoginResponse = await this.httpService.request.withJSON({
        username: username,
        password: password,
      }).post("/auth/login");

      this.storageSet(this.getStorageKey(), res.tkn);
      return res;
    }
    catch (e: unknown) {
      throw new Error("Login failed: " + (e as Error).message);
    }
  }

  public async validateJWT(token: string): Promise<ValidateJWTResponse> {
    return await this.httpService.request.withJSON({ token }).post("/auth/jwt/validate");
  }

  public async logout() {
    this.storageRemove(this.getStorageKey());
  }

  public async getJWTData(): Promise<any> {
    const token = this.storageGet(this.getStorageKey());
    if (!token) {
      throw new Error("No JWT token found in storage.");
    }

    return jwtDecode(token);
  }

  public async getCurrentUser(): Promise<User> {
    return await this.httpService.request.get("/auth/me");
  }

  public async validateCurrentUser(): Promise<ValidateJWTResponse> {
    const token = this.storageGet(this.getStorageKey());
    if (!token) {
      throw new Error("No JWT token found in storage.");
    }

    return await this.validateJWT(token);
  }

  public async checkAction(feature: string, scope: string): Promise<ActionResponse> {
    try {
      const encodedFeature = encodeURIComponent(feature);
      const encodedScope = encodeURIComponent(scope);
      const res: ActionResponse = await this.httpService.request.get(`/auth/permission/action/feature/${encodedFeature}/scope/${encodedScope}`);
      return res
    }
    catch (e: unknown) {
      // Backward compatibility for older API versions.
      try {
        const encodedFeature = encodeURIComponent(feature);
        const res: ActionResponse = await this.httpService.request.get(`/auth/permission/action/feature/${encodedFeature}`);
        return res;
      } catch {
        throw new Error("failed to checkAction : " + (e as Error).message);
      }
    }
  }

  public async checkPermission(feature: string, action: string, scope: string): Promise<PermissionResponse> {
    try {
      const encodedFeature = encodeURIComponent(feature);
      const encodedScope = encodeURIComponent(scope);
      const encodedAction = encodeURIComponent(action);
      const res: PermissionResponse = await this.httpService.request.get(`/auth/permission/check/feature/${encodedFeature}/scope/${encodedScope}/action/${encodedAction}`);
      return res
    }
    catch (e: unknown) {
      // Backward compatibility for older API versions.
      try {
        const encodedFeature = encodeURIComponent(feature);
        const encodedAction = encodeURIComponent(action);
        const res: PermissionResponse = await this.httpService.request.get(`/auth/permission/check/feature/${encodedFeature}/action/${encodedAction}`);
        return res;
      } catch {
        throw new Error("failed to checkPermission : " + (e as Error).message);
      }
    }
  }

  public async changePassword(oldPassword: string, newPassword: string): Promise<ChangePasswordResponse> {
    try {
      return await this.httpService.request.withJSON({
        oldPassword: oldPassword,
        newPassword: newPassword,
      }).post("/auth/change-password");
    }
    catch (e: unknown) {
      throw new Error("Change password failed: " + (e as Error).message);
    }
  }

  public async getUsers(): Promise<User[]> {
    return await this.httpService.request.get("/auth/user");
  }

  public async getUserById(userId: string): Promise<User> {
    return await this.httpService.request.get(`/auth/user/${userId}`);
  }

  public async createUser(firstName: string, lastName: string, username: string, email: string, password: string, number: string, userImage: string): Promise<User> {
    return await this.httpService.request.withJSON({
      firstName: firstName,
      lastName: lastName,
      username: username,
      email: email,
      password: password,
      number: number,
      userImage: userImage
    }).post("/auth/user");
  }

  // Partially updates a user's profile and group memberships. Only the fields
  // you provide are changed; omitted fields keep their current values and groups
  // are left untouched unless groupIDs is supplied (an empty array removes all
  // groups). Scoped to the caller's domain.
  public async updateUser(userId: string, data: UpdateUserInput): Promise<SuccessResponse> {
    const body: Record<string, unknown> = {};
    if (data.firstName !== undefined) body.firstName = data.firstName;
    if (data.lastName !== undefined) body.lastName = data.lastName;
    if (data.username !== undefined) body.username = data.username;
    if (data.email !== undefined) body.email = data.email;
    if (data.number !== undefined) body.number = data.number;
    if (data.userImage !== undefined) body.userImage = data.userImage;
    if (data.groupIDs !== undefined) body.groupIDs = data.groupIDs;

    return await this.httpService.request.withJSON(body).put(`/auth/user/${userId}`);
  }

  // Soft-deletes a user (marks deleted, removes group/permission memberships).
  // Scoped to the caller's domain.
  public async deleteUser(userId: string): Promise<SuccessResponse> {
    return await this.httpService.request.delete(`/auth/user/${userId}`);
  }

  // Generates a new random password for the user and returns it. Scoped to the
  // caller's domain.
  public async resetPassword(userId: string): Promise<ResetPasswordResponse> {
    return await this.httpService.request.post(`/auth/user/${userId}/reset-password`);
  }

  public async getGroups(): Promise<Group[]> {
    return await this.httpService.request.get("/auth/group");
  }

  public async createGroup(name: string, features: Feature[]): Promise<Group> {
    return await this.httpService.request.withJSON({
      name: name,
      features: features
    }).post("/auth/group");
  }

  public async addUserToGroup(userId: string, groupId: string): Promise<ActionResponse> {
    return await this.httpService.request.post(`/auth/group/${groupId}/user/${userId}`);
  }

  public async addPermissionsToGroup(group_id: string, permissions: Feature[]): Promise<ActionResponse> {
    return await this.httpService.request.withJSON({
      group_id, permissions
    }).post("/auth/permission");
  }

  public async getPermissions(): Promise<Feature[]> {
    const res: {permissions: Feature[]} = await this.httpService.request.get("/auth/permission");
    return res.permissions ?? [];
  }
}

import { HTTPService } from "../services/http.service.js";
import { Action, ActionResponse, Feature, Group, LoginResponse, User, ValidateJWTResponse } from "../types/auth.models.js";

export class Auth {
  private httpService: HTTPService;

  constructor(httpService: HTTPService) {
    this.httpService = httpService;
  }

  public async login(username: string, password: string): Promise<LoginResponse | undefined> {
    let res: LoginResponse
    try {
      res = await this.httpService.request.withJSON({
        username: username,
        password: password,
      }).post("/auth/login");

      if (localStorage) {
        localStorage.setItem("x-machhub-auth-tkn", res.tkn); // Set User JWT
      } else {
        console.error("localStorage is not available. The program needs to be in a browser environment.");
      }
      return res
    }
    catch (e: unknown) {
      if ((e as Error).message == "localStorage is not defined") {
        throw new Error("Login failed: localStorage is not available. The program needs to be in a browser environment.");
      }
      throw new Error("Login failed: " + (e as Error).message);
    }
  }

  public async validateJWT(token: string): Promise<ValidateJWTResponse>{
    let res:ValidateJWTResponse = await this.httpService.request.withJSON({ token }).post("/auth/jwt/validate");
    return res
  }

  public async logout() {
    localStorage.removeItem("x-machhub-auth-tkn"); // Remove User JWT
  }

  public async checkAction(feature: string, scope: string): Promise<ActionResponse> {
    try {
      const res: ActionResponse = await this.httpService.request.get(`/auth/permission/action/feature/${feature}/scope/${scope}`);
      return res
    }
    catch (e: unknown) {
      throw new Error("failed to checkAction : " + (e as Error).message);
    }
  }

  public async checkPermission(feature: string, scope: string, action: Action): Promise<ActionResponse> {
    try {
      const res: ActionResponse = await this.httpService.request.get(`/auth/permission/check/feature/${feature}/scope/${scope}/action/${action}`);
      return res
    }
    catch (e: unknown) {
      throw new Error("failed to checkPermission : " + (e as Error).message);
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
}

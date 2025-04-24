import { HTTPService } from "../services/http.service";
import { Action, ActionResponse, Group, LoginResponse, User } from "../types/auth.models";

export class Auth {
  private httpService: HTTPService;

  constructor(httpService: HTTPService) {
    this.httpService = httpService;
  }

  public async login(username: string, password: string): Promise<LoginResponse|undefined> {
    let res: LoginResponse
    try {
      res = await this.httpService.request.withJSON({
          username: username,
          password: password,
      }).post("/auth/login");
      console.log("res:", res)
      console.log(localStorage)
 
      if (localStorage){
        localStorage.setItem("x-machhub-auth-tkn", res.tkn); // Set User JWT
      } else {
        console.error("localStorage is not available. The program needs to be in a browser environment.");
      }
      return res
    }
    catch (e:unknown) {
      if ((e as Error).message == "localStorage is not defined"){
        throw new Error("Login failed: localStorage is not available. The program needs to be in a browser environment.");
      }
      throw new Error("Login failed: " + (e as Error).message);
    }
  }

  public async logout() {
      localStorage.removeItem("x-machhub-auth-tkn"); // Remove User JWT
  }

  // TODO : Check Action
  public async checkAction(feature:string, scope:string): Promise<ActionResponse> {
    try {
      const res: ActionResponse = await this.httpService.request.get(`/auth/permission/action/feature/${feature}/scope/${scope}`);
      return res
    }
    catch (e:unknown) {
      throw new Error("failed to checkAction : " + (e as Error).message);
    }
  }

  // TODO : Check Permission
  public async checkPermission(feature:string, scope:string, action:Action): Promise<ActionResponse> {
    try {
      const res: ActionResponse = await this.httpService.request.get(`/auth/permission/check/feature/${feature}/scope/${scope}/action/${action}`);
      return res
    }
    catch (e:unknown) {
      throw new Error("failed to checkPermission : " + (e as Error).message);
    }
  }

  // TODO : create account
  public async createUser(userDetails:User): Promise<LoginResponse> {
    throw new Error("Not implemented yet: TODO : createUser");
    // return await this.httpService.request.withJSON({ ...userDetails }).post("/auth/user");
  }

  // TODO : create groups
  public async createGroup(userDetails:Group): Promise<LoginResponse> {
    throw new Error("Not implemented yet: TODO : createGroup");
    // return await this.httpService.request.withJSON({ ...userDetails }).post("/auth/group");
  }

  // TODO : create features
  public async createFeature(userDetails:User): Promise<LoginResponse> {
    throw new Error("Not implemented yet: TODO : createFeature");
  }
}

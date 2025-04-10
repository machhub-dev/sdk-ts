import { HTTPService } from "../services/http.service";
import { LoginResponse } from "../types/auth.models";

export class Auth {
  private httpService: HTTPService;

  constructor(httpService: HTTPService) {
    this.httpService = httpService;
  }

  public async login(username: string, password: string): Promise<LoginResponse> {
    return await this.httpService.request.withJSON({
      username: username,
      password: password,
    }).post("/auth/login");
  }
}

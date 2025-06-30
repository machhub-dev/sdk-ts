import { HTTPService } from "../services/http.service";

export class Flow {
  private httpService: HTTPService;

  constructor(httpService: HTTPService) {
    this.httpService = httpService;
  }

  public async executeFlow(name: string, payload: any): Promise<any> {
    return await this.httpService.request.withJSON(payload).post("flow/execute/name/" + name);
  }
}

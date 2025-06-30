import { HTTPService } from "../services/http.service";
import { NATSService } from "../services/nats.service";

export class Function {
  private httpService: HTTPService;
  private natsService: NATSService | null;

  constructor(httpService: HTTPService, natsService: NATSService) {
    this.httpService = httpService;
    this.natsService = natsService;
  }

  public async executeFunction(function_type: string, function_name: string, payload: any): Promise<any> {
    return await this.httpService.request.withJSON({
      function_type: function_type,
      function_name: function_name,
      payload: payload,
    }).post("function/execute");
  }

  public async addFunction(name: string, func: (data: Record<string,any>) => Record<string,any>): Promise<any> {
    if (!this.natsService) {
      throw new Error("NATS service not connected");
    }
    return this.natsService.addFunction(name, func);
  }

  public async initializeFunctions(): Promise<any> {
    if (!this.natsService) {
      throw new Error("NATS service not connected");
    }
    return this.natsService.initializeFunctions();
  }
}

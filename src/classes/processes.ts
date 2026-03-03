import { HTTPService } from "../services/http.service.js";

export class Processes {
  private httpService: HTTPService;

  constructor(httpService: HTTPService) {
    this.httpService = httpService;
  }

  /**
   * Executes a process by name with optional input data
   * @param name - The name of the process to execute
   * @param input - Optional input data to pass to the process
   * @returns The result of the process execution
   */
  public async execute(name: string, input?: Record<string, any>): Promise<any> {
    const payload = {
      name,
      input: input || {}
    };
    return await this.httpService.request.withJSON(payload).post("processes/execute");
  }
}

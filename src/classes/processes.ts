import { HTTPService } from "../services/http.service.js";
import { Process, ProcessTrigger } from "../types/processes.models.js";
import { RecordID, RecordIDToString } from "../types/recordID.models.js";

export { Process, ProcessTrigger } from "../types/processes.models.js";
export type { ProcessLanguage, TriggerType, TriggerConfig, InputType, InputConfig, ProcessInput, OutputType, OutputConfig, ProcessOutput, ProcessKey, ProcessValue } from "../types/processes.models.js";

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

  /**
   * Retrieves all processes for the current domain
   * @returns A list of domain processes
   */
  public async getProcesses(): Promise<Process[]> {
    return await this.httpService.request.get("processes/domain");
  }

  /**
   * Updates the triggers for a specific process
   * @param id - The ID of the process to update
   * @param triggers - The list of triggers to set on the process
   * @returns The updated process
   */
  public async changeTriggers(id: RecordID, triggers: ProcessTrigger[]): Promise<Process> {
    let stringID = RecordIDToString(id); 
    return await this.httpService.request.withJSON({ triggers } as unknown as Record<string, unknown>).put(`processes/triggers/${stringID}`);
  }
}


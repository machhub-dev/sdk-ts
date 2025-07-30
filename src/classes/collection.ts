import { HTTPService } from "../services/http.service";
import { MQTTService } from "../services/mqtt.service";

export class Collection {
  protected httpService: HTTPService;
  protected mqttService: MQTTService | null;
  protected collectionName: string;
  protected queryParams: Record<string, any> = {};

  constructor(httpService: HTTPService, mqttService: MQTTService | null, collectionName: string) {
    this.httpService = httpService;
    this.mqttService = mqttService;
    this.collectionName = collectionName;
  }

  filter(fieldName: string, operator: "=" | ">" | "<" | "<=" | ">=" | "!=", value: any): Collection {
    this.queryParams[`filter[${fieldName}][${operator}][${typeof value}]`] = value;
    return this;
  }

  sort(field: string, direction: "asc" | "desc" = "asc"): Collection {
    this.queryParams.sort = `[${field}][${direction}]`;
    return this;
  }

  limit(limit: number): Collection {
    this.queryParams.limit = limit;
    return this;
  }

  offset(offset: number): Collection {
    this.queryParams.offset = offset;
    return this;
  }

  async getAll(): Promise<any[]> {
    return this.httpService.request.get(this.collectionName + "/all", this.queryParams);
  }

  async getOne(id: string): Promise<any> {
    return this.httpService.request.get(id);
  }

  async create(data: Record<string, any>): Promise<any> {
    return this.httpService.request.withJSON(data).post(this.collectionName);
  }

  async update(id: string, data: Record<string, any>): Promise<any> {
    return this.httpService.request.withJSON(data).put(id);
  }

  async delete(id: string): Promise<any> {
    return this.httpService.request.delete(id);
  }
}

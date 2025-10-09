import { HTTPService } from "../services/http.service.js";
import { MQTTService } from "../services/mqtt.service.js";

export class CollectionError extends Error {
  public operation: string;
  public collectionName: string;
  public originalError: Error;

  constructor(operation: string, collectionName: string, originalError: Error) {
    super(`Collection operation '${operation}' failed on '${collectionName}': ${originalError.message}`);
    this.name = 'CollectionError';
    this.operation = operation;
    this.collectionName = collectionName;
    this.originalError = originalError;
  }
}

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
    try {
      return await this.httpService.request.get(this.collectionName + "/all", this.queryParams);
    } catch (error) {
      throw new CollectionError('getAll', this.collectionName, error as Error);
    }
  }

  async getOne(id: string): Promise<any> {
    if (!id) {
      throw new Error("ID must be provided");
    }
    try {
      return await this.httpService.request.get(id);
    } catch (error) {
      throw new CollectionError('getOne', this.collectionName, error as Error);
    }
  }

  async create(data: Record<string, any>): Promise<any> {
    try {
      return await this.httpService.request.withJSON(data).post(this.collectionName);
    } catch (error) {
      throw new CollectionError('create', this.collectionName, error as Error);
    }
  }

  async update(id: string, data: Record<string, any>): Promise<any> {
    if (!id) {
      throw new Error("ID must be provided");
    }
    try {
      return await this.httpService.request.withJSON(data).put(id);
    } catch (error) {
      throw new CollectionError('update', this.collectionName, error as Error);
    }
  }

  async delete(id: string): Promise<any> {
    if (!id) {
      throw new Error("ID must be provided");
    }
    try {
      return await this.httpService.request.delete(id);
    } catch (error) {
      throw new CollectionError('delete', this.collectionName, error as Error);
    }
  }
}

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


  filter(fieldName: string, operator: "=" | ">" | "<" | "<=" | ">=" | "!=" | "CONTAINS", value: any): Collection {
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

  expand(fields: string | string[]): Collection {
    this.queryParams.expand = Array.isArray(fields) ? fields.join(",") : fields;
    return this;
  }

  private applyOptions(options?: Record<string, any>) {
    if (!options) return;

    for (const [key, value] of Object.entries(options)) {
      if (value !== undefined && value !== null) {
        this.queryParams[key] = value;
      }
    }
  }

  async first(): Promise<any> {
    const results = await this.limit(1).getAll();
    return results[0] ?? null
  }

  async getAll(options?: { expand?: string | string[] }): Promise<any[]> {
    try {
      this.applyOptions(options)
      if (options?.expand) {
        this.queryParams.expand = Array.isArray(options.expand) ? options.expand.join() : options.expand
      }
      return await this.httpService.request.get(this.collectionName + "/all", this.queryParams);
    } catch (error) {
      throw new CollectionError('getAll', this.collectionName, error as Error);
    }
  }

  async count(options?: { filter?: any }): Promise<number> {
    try {
      this.applyOptions(options);

      // Build query parameters for filters
      const response: { count: number } = await this.httpService.request.get(`${this.collectionName}/count`, this.queryParams);

      // Extract count from response
      return response.count;
    } catch (error) {
      throw new CollectionError('count', this.collectionName, error as Error);
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
      const formData = new FormData();

      for (const [key, value] of Object.entries(data)) {
        if (value instanceof File) {
          formData.append(key, value, value.name);
          data[key] = value.name
        }
      }
      formData.append("record", JSON.stringify(data))
      return await this.httpService.request
        .withBody(formData)
        .post(this.collectionName);
    } catch (error) {
      throw new CollectionError("create", this.collectionName, error as Error);
    }
  }

  async update(id: string, data: Record<string, any>): Promise<any> {
    if (!id) {
      throw new Error("ID must be provided");
    }
    try {
      const formData = new FormData();

      for (const [key, value] of Object.entries(data)) {
        if (value instanceof File) {
          formData.append(key, value, value.name);
          data[key] = value.name;
        }
      }
      formData.append("record", JSON.stringify(data));

      return await this.httpService.request
        .withBody(formData)
        .put(id);
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

  async getFile(fileName: string, fieldName: string): Promise<Blob> {
    try {
      return await this.httpService.request.withJSON({
        fileName,
        collectionName: this.collectionName,
        fieldName
      }).patch("file");
    } catch (error) {
      throw new CollectionError('getFile', this.collectionName, error as Error);
    }
  }

}

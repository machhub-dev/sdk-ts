import { HTTPService } from "../services/http.service.js";
import { MQTTService } from "../services/mqtt.service.js";
import { BasicOperator, Operator } from "../types/operator.models.js";
import { RecordID, RecordIDToString } from "../types/recordID.models.js";

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
  protected orFilters: Array<{ fieldName: string; operator: Operator; value: any }> = [];
  protected orArrayFilters: Array<{ arrayField: string; subField: string; operator: BasicOperator; value: any }> = [];

  constructor(httpService: HTTPService, mqttService: MQTTService | null, collectionName: string) {
    this.httpService = httpService;
    this.mqttService = mqttService;
    this.collectionName = collectionName;
  }


  filter(fieldName: string, operator: Operator, value: any): Collection {
    this.queryParams[`filter[${fieldName}][${operator}][${typeof value}]`] = value;
    return this;
  }

  /**
   * Add a filter condition joined with OR logic.
   * Multiple orFilter() calls are OR'd together and the resulting group
   * is AND'd with any regular filter() conditions.
   *
   * Example: find records where status is 'active' OR 'pending'
   *   .orFilter('status', '=', 'active')
   *   .orFilter('status', '=', 'pending')
   */
  orFilter(fieldName: string, operator: Operator, value: any): Collection {
    this.orFilters.push({ fieldName, operator, value });
    return this;
  }

  /**
   * Add an array-element filter condition joined with OR logic.
   * Multiple orFilterInArray() calls are OR'd together and the resulting
   * group is AND'd with any regular filter() conditions.
   *
   * Example: find records where any line has itemId = 'items:a' OR itemId = 'items:b'
   *   .orFilterInArray('orderLines', 'itemId', '=', 'items:a')
   *   .orFilterInArray('orderLines', 'itemId', '=', 'items:b')
   */
  orFilterInArray(arrayField: string, subField: string, operator: BasicOperator, value: any): Collection {
    this.orArrayFilters.push({ arrayField, subField, operator, value });
    return this;
  }

  private buildQueryParams(): Record<string, any> {
    const params: Record<string, any> = { ...this.queryParams };
    this.orFilters.forEach((f, i) => {
      params[`filter_or[${i}][${f.fieldName}][${f.operator}][${typeof f.value}]`] = f.value;
    });
    const offset = this.orFilters.length;
    this.orArrayFilters.forEach((f, i) => {
      params[`filter_or[${offset + i}][${f.arrayField}.${f.subField}][ARRAY_WHERE_${f.operator}][${typeof f.value}]`] = f.value;
    });
    return params;
  }

  /**
   * Filter records where a JSON array field contains at least one element
   * matching a sub-field condition.
   *
   * Example: find all POs where any line has itemId = 'items:abc123'
   *   .filterInArray('orderLines', 'itemId', '=', 'items:abc123')
   *
   * Generates SurrealDB: `orderLines`[WHERE `itemId` = 'items:abc123']
   */
  filterInArray(arrayField: string, subField: string, operator: BasicOperator, value: any): Collection {
    this.queryParams[`filter[${arrayField}.${subField}][ARRAY_WHERE_${operator}][${typeof value}]`] = value;
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

  async getAll(options?: { expand?: string | string[], fields?: string | string[] }): Promise<any[]> {
    try {
      this.applyOptions(options)
      if (options?.expand) {
        this.queryParams.expand = Array.isArray(options.expand) ? options.expand.join(",") : options.expand
      }
      if (options?.fields) {
        this.queryParams.fields = Array.isArray(options.fields) ? options.fields.join(",") : options.fields
      }
      return await this.httpService.request.get(this.collectionName + "/all", this.buildQueryParams());
    } catch (error) {
      throw new CollectionError('getAll', this.collectionName, error as Error);
    }
  }

  async count(): Promise<number> {
    try {
      const response: { count: number } = await this.httpService.request.get(`${this.collectionName}/count`, this.buildQueryParams());
      return response.count;
    } catch (error) {
      throw new CollectionError('count', this.collectionName, error as Error);
    }
  }
  
  async getOne(id: string | RecordID, options?: { expand?: string | string[] }): Promise<any> {
    const resolvedId = typeof id === 'string' ? id : RecordIDToString(id);
    if (!resolvedId) {
      throw new Error("ID must be provided");
    }
    try {
      const queryParams: any = {};

      // Handle expand parameter
      if (options?.expand) {
        queryParams.expand = Array.isArray(options.expand)
          ? options.expand.join(',')
          : options.expand;
      }

      return await this.httpService.request.get(encodeURIComponent(resolvedId), queryParams);
    } catch (error) {
      throw new CollectionError('getOne', this.collectionName, error as Error);
    }
  }
  async create(data: Record<string, any>): Promise<any> {
    try {
      const formData = new FormData();

      for (const [key, value] of Object.entries(data)) {
        if (typeof File !== 'undefined' && value instanceof File) {
          formData.append(key, value, value.name);
          data[key] = value.name;
        } else if (
          typeof File !== 'undefined' &&
          Array.isArray(value) &&
          value.length > 0 &&
          value[0] instanceof File
        ) {
          const names: string[] = [];
          for (const file of value as File[]) {
            formData.append(key, file, file.name);
            names.push(file.name);
          }
          data[key] = names;
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

  async update(id: string | RecordID, data: Record<string, any>): Promise<any> {
    const resolvedId = typeof id === 'string' ? id : RecordIDToString(id);
    if (!resolvedId) {
      throw new Error("ID must be provided");
    }
    try {
      const formData = new FormData();

      for (const [key, value] of Object.entries(data)) {
        if (typeof File !== 'undefined' && value instanceof File) {
          formData.append(key, value, value.name);
          data[key] = value.name;
        } else if (
          typeof File !== 'undefined' &&
          Array.isArray(value) &&
          value.length > 0 &&
          value.some((v: unknown) => v instanceof File)
        ) {
          const names: string[] = [];
          for (const item of value as (string | File)[]) {
            if (item instanceof File) {
              formData.append(key, item, item.name);
              names.push(item.name);
            } else {
              names.push(item);
            }
          }
          data[key] = names;
        }
      }
      formData.append("record", JSON.stringify(data));

      return await this.httpService.request
        .withBody(formData)
        .put(encodeURIComponent(resolvedId));
    } catch (error) {
      throw new CollectionError('update', this.collectionName, error as Error);
    }
  }

  async delete(id: string | RecordID): Promise<any> {
    const resolvedId = typeof id === 'string' ? id : RecordIDToString(id);
    if (!resolvedId) {
      throw new Error("ID must be provided");
    }
    try {
      return await this.httpService.request.delete(encodeURIComponent(resolvedId));
    } catch (error) {
      throw new CollectionError('delete', this.collectionName, error as Error);
    }
  }

  async getFile(fileName: string, fieldName: string, recordID: string): Promise<Blob> {
    try {
      return await this.httpService.request.withJSON({
        fileName,
        collectionName: this.collectionName,
        fieldName,
        recordID
      }).patch("file");
    } catch (error) {
      throw new CollectionError('getFile', this.collectionName, error as Error);
    }
  }

}

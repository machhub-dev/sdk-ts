import { HistorizedData } from "./types/tag.models";
import { HTTPService } from "./services/http.service";
import { MQTTService } from "./services/mqtt.service";
import { getAppConfig } from "./utils/appConfig";

let nats_broker_url = "nats://localhost:4222";

// Core HTTP client class
export class HTTPClient {
  private httpService: HTTPService;

  /**
   * Creates a new HTTPClient instance
   * @param applicationID The ID for your application (optional, will be read from environment variable APP_ID if not provided)
   * @param httpUrl The base URL for HTTP connection (default = http://localhost:80)
   */
  constructor(applicationID?: string, httpUrl: string = "http://localhost:80") {
    if (!applicationID) {
      const config = getAppConfig()
      console.log("config", config)
      if (config != undefined){
        applicationID = config.application_id
      }else{
        throw new Error("Failed to get Configuration.");
      }
      if (!applicationID) {
        throw new Error("Application ID is required. Set it via the APP_ID environment variable or pass it as a parameter.");
      }
    }
    this.httpService = new HTTPService(httpUrl, "machhub", applicationID);
  }

  /**
   * Gets server info
   */
  async getInfo(): Promise<any> {
    return this.httpService.request.get("info");
  }

  /**
   * Creates a collection instance to interact with the specified table/collection
   * @param collectionName The collection/table name
   */
  collection(collectionName: string): Collection {
    return new Collection(this.httpService, null, collectionName);
  }

  /**
   * Access to the historian collection
   */
  get historian(): Historian {
    return new Historian(this.httpService, null);
  }
}

// Core MQTT client class
export class MQTTClient {
  private mqttService: MQTTService;

  /**
   * Creates a new MQTTClient instance
   * @param applicationID The ID for your application (optional, will be read from environment variable APP_ID if not provided)
   * @param mqttUrl The base URL for MQTT connection (default = mqtt://localhost:180)
   */
  constructor(applicationID?: string, mqttUrl: string = "mqtt://localhost:180") {
    if (!applicationID) {
      applicationID = process.env.APP_ID;
      if (!applicationID) {
        throw new Error("Application ID is required. Set it via the APP_ID environment variable or pass it as a parameter.");
      }
    }
    this.mqttService = new MQTTService(mqttUrl);
  }

  /**
   * Subscribes to live tag data updates
   * @param topic The tag topic
   * @param callback The callback function for data updates
   */
  async subscribeLiveData(topic: string, callback: (data: any) => void): Promise<any> {
    return this.mqttService.addTopicHandler(topic, callback);
  }
}

// Base class for collections
class Collection {
  protected httpService: HTTPService;
  protected mqttService: MQTTService | null;
  protected collectionName: string;
  protected queryParams: Record<string, any> = {};

  constructor(httpService: HTTPService, mqttService: MQTTService | null, collectionName: string) {
    this.httpService = httpService;
    this.mqttService = mqttService;
    this.collectionName = collectionName;
  }

  /**
   * Applies filter conditions to the query
   * @param fieldName The field to filter on
   * @param operator The operator for comparison
   * @param value The value to compare against
   */
  filter(fieldName: string, operator: string, value: any): Collection {
    this.queryParams[`filter[${fieldName}][${operator}]`] = value;
    return this;
  }

  /**
   * Sorts the results
   * @param field The field to sort by
   * @param direction The sort direction ("asc" or "desc")
   */
  sort(field: string, direction: "asc" | "desc" = "asc"): Collection {
    this.queryParams.sort = direction === "asc" ? field : `-${field}`;
    return this;
  }

  /**
   * Limits the number of results
   * @param limit Maximum number of items to return
   */
  limit(limit: number): Collection {
    this.queryParams.limit = limit;
    return this;
  }

  /**
   * Skips the specified number of results
   * @param offset Number of items to skip
   */
  offset(offset: number): Collection {
    this.queryParams.offset = offset;
    return this;
  }

  /**
   * Fetches all matching records
   */
  async getAll(): Promise<any[]> {
    return this.httpService.request
      .get(this.collectionName + "/all");
  }

  /**
   * Fetches a single record by ID
   * @param id The record ID
   */
  async getOne(id: string): Promise<any> {
    return this.httpService.request.get(id);
  }

  /**
   * Creates a new record
   * @param data The record data
   */
  async create(data: Record<string, any>): Promise<any> {
    return this.httpService.request
      .withJSON(data)
      .post(this.collectionName);
  }

  /**
   * Updates an existing record
   * @param id The record ID
   * @param data The updated data
   */
  async update(id: string, data: Record<string, any>): Promise<any> {
    return this.httpService.request
      .withJSON(data)
      .put(id);
  }

  /**
   * Deletes a record
   * @param id The record ID
   */
  async delete(id: string): Promise<void> {
    return this.httpService.request.delete(id);
  }
}

// Specialized collection for tags
class Historian extends Collection {
  constructor(httpService: HTTPService, mqttService: MQTTService | null) {
    super(httpService, mqttService, "historian");
  }

  async getAllTags(): Promise<string[]> {
    return this.httpService.request.get("historian/list");
  }

  /**
   * Gets historical data for a specific tag
   * @param topic The tag topic
   * @param startDate The start date for historical data, empty string to get all data
   */
  // TODO : StartDate to a Date type?
  async getHistoricalData(topic: string, startDate: string): Promise<HistorizedData[]> {
    return this.httpService.request.withJSON({
      topic: topic,
      startDate: startDate
    }).patch("historian");
  }

  /**
   * Subscribes to live tag data updates
   * @param topic The tag topic
   * @param callback The callback function for data updates
   */
  async subscribeLiveData(topic: string, callback: (data: any) => void): Promise<any> {
    if (!this.mqttService) {
      throw new Error("MQTT service not connected");
    }
    
    // Subscribe to the MQTT topic and set up callback
    return this.mqttService.addTopicHandler(topic, callback);
  }

  /**
   * Gets live tag data with initial historical context
   * @param topic The tag topic
   * @param startDate The start date for historical context, empty string to get all data
   */
  // TODO : StartDate to a Date type?
  async getLiveData(topic: string, startDate: string): Promise<any> {
    return this.httpService.request.withJSON({
      topic: topic,
      startDate: startDate
    }).get("tag");
  }
}

// Example usage
export const SDK = {
  HTTPClient(applicationID?: string, httpUrl?: string): HTTPClient {
    return new HTTPClient(applicationID, httpUrl);
  },
  MQTTClient(applicationID?: string, mqttUrl?: string): MQTTClient {
    return new MQTTClient(applicationID, mqttUrl);
  }
};
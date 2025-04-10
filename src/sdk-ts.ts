import { HistorizedData } from "./types/tag.models";
import { HTTPService } from "./services/http.service";
import { MQTTService } from "./services/mqtt.service";
import { NATSService } from "./services/nats.service";
import { getAppConfig } from "./utils/appConfig";

const MACHHUB_SDK_PATH = "machhub";

// Core HTTP client class
export class HTTPClient {
  private httpService: HTTPService;

  /**
   * Creates a new HTTPClient instance
   * @param applicationID The ID for your application (required)
   * @param httpUrl The base URL for HTTP connection (default = http://localhost:80)
   */
  constructor(applicationID: string, httpUrl: string = "http://localhost:80") {
    if (!applicationID) {
      const config = getAppConfig()
      console.log("config", config)
      if (config != undefined) {
        applicationID = config.application_id;
      } else {
        throw new Error("Failed to get Configuration.");
      }
      if (!applicationID) {
        throw new Error("Application ID is required. Set it via the APP_ID environment variable or pass it as a parameter.");
      }
    }
    this.httpService = new HTTPService(httpUrl, MACHHUB_SDK_PATH, applicationID);
  }

  /**
   * Gets server info
   */
  async getInfo(): Promise<any> {
    return this.httpService.request.get("info");
  }
}

// Core MQTT client class
export class MQTTClient {
  private mqttService: MQTTService;
  private static instance: MQTTClient | undefined;

  private constructor(mqttService: MQTTService) {
    this.mqttService = mqttService;
  }

  /**
   * Creates a new MQTTClient instance
   * @param applicationID The ID for your application
   * @param mqttUrl The base URL for MQTT connection (default = ws://localhost:180)
   */
  static async getInstance(applicationID?: string, mqttUrl: string = "ws://localhost:180"): Promise<MQTTClient> {
    // if (!applicationID) {
    //   applicationID = process.env.APP_ID;
    //   if (!applicationID) {
    //     throw new Error("Application ID is required. Set it via the APP_ID environment variable or pass it as a parameter.");
    //   }
    // }
    if (!this.instance) {
      const mqttService = await MQTTService.getInstance(mqttUrl);
      this.instance = new MQTTClient(mqttService); // Use the constructor to initialize the instance
    }
    return this.instance;
  }

  /**
   * Subscribes to live tag data updates
   * @param topic The tag topic
   * @param callback The callback function for data updates
   */
  async subscribeLiveData(topic: string, callback: (data: any) => void): Promise<any> {
    return this.mqttService.addTopicHandler(topic, callback);
  }

  /**
   * Publishes a message to a specific topic
   * @param topic The topic to publish to
   * @param data The data to publish
   */
  async publish(topic: string, data: any): Promise<any> {
    return this.mqttService.publish(topic, data);
  }
}

export class NATSClient {
  private natsService: NATSService;
  private static instance: NATSClient | undefined;

  private constructor(natsService: NATSService) {
    this.natsService = natsService;
  }

  /**
   * Creates a new NATSClient instance
   * @param applicationID The ID for your application
   * @param natsUrl The base URL for NATS connection (default = nats://localhost:4222)
   */
  static async getInstance(applicationID?: string, natsUrl: string = "nats://localhost:4222"): Promise<NATSClient> {
    if (!this.instance) {
      const natsService = await NATSService.getInstance(natsUrl);
      this.instance = new NATSClient(natsService);
    }
    return this.instance;
  }

  /**
   * Subscribes to subject updates
   * @param subject The subject to subscribe to
   * @param callback The callback function for data updates
   */
  async subscribe(subject: string, callback: (data: any) => void): Promise<any> {
    return this.natsService.addSubjectHandler(subject, callback);
  }

  /**
   * Publishes a message to a specific subject
   * @param subject The subject to publish to
   * @param data The data to publish
   */
  async publish(subject: string, data: any): Promise<any> {
    return this.natsService.publish(subject, data);
  }

  /**
   * Adds a new function to the registry
   * @param name The name of the function
   * @param func The function implementation
   */
  async addFunction(name: string, func: (data: { [key: string]: any }) => { [key: string]: any }): Promise<any> {
    return this.natsService.addFunction(name, func);
  }

  /**
   * Subscribes to function execution
   * Should only be called once all functions are registered
   */
  async subscribeToFunctionExecution(): Promise<any> {
    return this.natsService.subscribeToFunctionExecution();
  }

  public static log(message?: any, ...optionalParams: any[]) {
    console.log("[TYPESCRIPT] >", message, ...optionalParams);
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
  filter(fieldName: string, operator: "=" | ">" | "<" | "<=" | ">=" | "!=", value: any): Collection {
    this.queryParams[`filter[${fieldName}][${operator}]`] = value;
    return this;
  }

  sort(field: string, direction: "asc" | "desc" = "asc"): Collection {
    this.queryParams.sort = direction === "asc" ? field : `-${field}`;
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
    return this.httpService.request.get(this.collectionName + "/all");
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

  /**
   * Deletes a record
   * @param id The record ID
   */
  async delete(id: string): Promise<void> {
    return this.httpService.request.delete(id);
  }
}

// Historian class
export class Historian {
  private httpService: HTTPService;
  private mqttService: MQTTService | null;

  constructor(httpService: HTTPService, mqttService: MQTTService | null) {
    this.httpService = httpService;
    this.mqttService = mqttService;
  }

  async getAllHistorizedTags(): Promise<string[]> {
    return this.httpService.request.get("historian/list");
  }

  // TODO : StartDate to a Date type, then convert to string in the HTTPService
  async getHistoricalData(topic: string, start_time: string, range?: string): Promise<HistorizedData[]> {
    return this.httpService.request.withJSON({
      topic: topic,
      start_time: start_time,
      range: range,
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
    this.mqttService.addTopicHandler(topic, callback);
  }
}

// Tag class
export class Tag {
  private httpService: HTTPService;
  private mqttService: MQTTService | null;

  constructor(httpService: HTTPService, mqttService: MQTTService | null) {
    this.httpService = httpService;
    this.mqttService = mqttService;
  }

  async getAllTags(): Promise<string[]> {
    return this.httpService.request.get("tag/list");
  }

  async publish(topic: string, data: any): Promise<void> {
    if (!this.mqttService) {
      throw new Error("MQTT service not connected");
    }
    this.mqttService.publish(topic, data);
  }

  async subscribe(topic: string, callback: (data: any) => void): Promise<void> {
    if (!this.mqttService) {
      throw new Error("MQTT service not connected");
    }
    this.mqttService.addTopicHandler(topic, callback);
  }
}

export class Function{
  private httpService: HTTPService;

  constructor(httpService:HTTPService){
    this.httpService = httpService
  }

  public async executeFunction(function_type:string,function_name:string,payload:any): Promise<any>{
    return await this.httpService.request.withJSON({
      function_type: function_type,
      function_name:function_name,
      payload:payload
    }).post('function/execute')
  }
}

export class Flow{
  private httpService: HTTPService;

  constructor(httpService:HTTPService){
    this.httpService = httpService
  }

  public async executeFlow(flow_id:string, payload:any):Promise<any>{
    let res = await this.httpService.request.withJSON(payload).post('flow/execute/' + flow_id)
    return res
  }
}


// SDK Class
export class SDK {
  private http: HTTPClient | null = null;
  private mqtt: MQTTClient | null = null;
  private nats: NATSClient | null = null;
  historian : Historian | null = null;
  tag : Tag | null = null;
  function : Function | null = null;
  flow : Flow | null = null;

  /**
   * Initializes the SDK with the required clients.
   * @param application_id {string} The application ID.
   * @param httpUrl {string} The base URL for HTTP connection (default = http://localhost:80)
   * @param mqttUrl {string} The base URL for MQTT connection (default = ws://localhost:180)
   * @param natsUrl {string} The base URL for NATS connection (default = nats://localhost:4222)
   * @returns {Promise<boolean>} Resolves to true if initialization is successful.
   */
  public async Initialize(application_id: string, httpUrl?: string, mqttUrl?: string, natsUrl?: string): Promise<boolean> {
    this.http = new HTTPClient(application_id, httpUrl);
    this.mqtt = await MQTTClient.getInstance(application_id, mqttUrl);
    this.nats = await NATSClient.getInstance(application_id, natsUrl);
    this.historian = new Historian(this.http["httpService"], this.mqtt["mqttService"]);
    this.tag = new Tag(this.http["httpService"], this.mqtt["mqttService"]);
    this.function = new Function(this.http["httpService"])
    this.flow = new Flow(this.http["httpService"])

    return true;
  }

  /**
   * Creates a collection instance to interact with the specified table/collection.
   * Throws an error if the SDK is not initialized.
   * @param collectionName {string} The collection/table name.
   * @returns {Collection} An instance of Collection.
   */
  public collection(collectionName: string): Collection {
    if (!this.http) {
      throw new Error("SDK is not initialized. Call `Initialize` before accessing collection.");
    }
    return new Collection(this.http["httpService"], this.mqtt ? this.mqtt["mqttService"] : null, collectionName);
  }
}
import { HTTPService } from "./services/http.service";
import { MQTTService } from "./services/mqtt.service";
import { NATSService } from "./services/nats.service";
import { getAppConfig } from "./utils/appConfig";
import { Collection } from "./classes/collection";
import { Historian } from "./classes/historian";
import { Tag } from "./classes/tag";
import { Function } from "./classes/function";
import { Flow } from "./classes/flow";
import { Auth } from "./classes/auth";

const MACHHUB_SDK_PATH = "machhub";

// Core HTTP client class
class HTTPClient {
  private httpService: HTTPService;

  /**
   * Creates a new HTTPClient instance
   * @param applicationID The ID for your application (required)
   * @param httpUrl The base URL for HTTP connection (default = http://localhost:80)
   */
  constructor(applicationID: string, httpUrl: string = "http://localhost:80") {
    if (!applicationID) {
      const config = getAppConfig()
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
class MQTTClient {
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

// Core NATS client class
class NATSClient {
  private natsService: NATSService;
  private static instance: NATSClient | undefined;

  private constructor(natsService: NATSService) {
    this.natsService = natsService;
  }

  /**
   * Creates a new NATSClient instance
   * @param applicationID The ID for your application
   * @param natsUrl The base URL for NATS connection (default = ws://localhost:7500)
   */
  static async getInstance(applicationID?: string, natsUrl: string = "ws://localhost:7500"): Promise<NATSClient> {
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
}

export interface SDKConfig {
  application_id: string;
  httpUrl?: string;
  mqttUrl?: string;
  natsUrl?: string;
}

// SDK Class
export class SDK {
  private http: HTTPClient | null = null;
  private mqtt: MQTTClient | null = null;
  private nats: NATSClient | null = null;
  private _historian: Historian | null = null;
  private _tag: Tag | null = null;
  private _function: Function | null = null;
  private _flow: Flow | null = null;
  private _auth: Auth | null = null;

  /**
   * Initializes the SDK with the required clients.
   *
   * Example usage:
   * ```typescript
   * import { SDK, type SDKConfig } from '@machhub-dev/sdk-ts';
   *
   * const config: SDKConfig = {
   *   application_id: 'your-app-id',
   *   httpUrl: 'http://localhost:80', // optional (default = http://localhost:80)
   *   mqttUrl: 'ws://localhost:180',  // optional (default = ws://localhost:180)
   *   natsUrl: 'ws://localhost:7500', // optional (default = ws://localhost:7500)
   * };
   *
   * const sdk = new SDK();
   * await sdk.Initialize(config);
   * ```
   *
   * @param config {SDKConfig} The configuration object containing initialization parameters. See SDKConfig for details.
   * @returns {Promise<boolean>} Resolves to true if initialization is successful.
   */
  public async Initialize(config: SDKConfig): Promise<boolean> {
    try {
      const { application_id, httpUrl, mqttUrl, natsUrl } = config;

      this.http = new HTTPClient(application_id, httpUrl);
      this.mqtt = await MQTTClient.getInstance(application_id, mqttUrl);
      this.nats = await NATSClient.getInstance(application_id, natsUrl);
      this._historian = new Historian(this.http["httpService"], this.mqtt["mqttService"]);
      this._tag = new Tag(this.http["httpService"], this.mqtt["mqttService"]);
      this._function = new Function(this.http["httpService"], this.nats["natsService"]);
      this._flow = new Flow(this.http["httpService"]);
      this._auth = new Auth(this.http["httpService"]);
    } catch (error: any) {
      console.error("Failed to initialize:", error);
      return false;
    }

    return true;
  }

  /**
   * Getter for `auth`. Ensures `auth` is accessed only after initialization.
   */
  public get auth(): Auth {
    if (!this._auth) {
      throw new Error("SDK is not initialized. Call `Initialize` before accessing `auth`.");
    }
    return this._auth;
  }

  /**
   * Getter for `historian`. Ensures `historian` is accessed only after initialization.
   */
  public get historian(): Historian {
    if (!this._historian) {
      throw new Error("SDK is not initialized. Call `Initialize` before accessing `historian`.");
    }
    return this._historian;
  }

  /**
   * Getter for `tag`. Ensures `tag` is accessed only after initialization.
   */
  public get tag(): Tag {
    if (!this._tag) {
      throw new Error("SDK is not initialized. Call `Initialize` before accessing `tag`.");
    }
    return this._tag;
  }

  /**
   * Getter for `function`. Ensures `function` is accessed only after initialization.
   */
  public get function(): Function {
    if (!this._function) {
      throw new Error("SDK is not initialized. Call `Initialize` before accessing `function`.");
    }
    return this._function;
  }

  /**
   * Getter for `flow`. Ensures `flow` is accessed only after initialization.
   */
  public get flow(): Flow {
    if (!this._flow) {
      throw new Error("SDK is not initialized. Call `Initialize` before accessing `flow`.");
    }
    return this._flow;
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
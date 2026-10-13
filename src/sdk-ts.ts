import { HTTPService } from "./services/http.service.js";
import { MQTTService } from "./services/mqtt.service.js";
import { Collection } from "./classes/collection.js";
import { Bridge } from "./classes/bridge.js";
import { Env } from "./classes/env.js";
import { Historian } from "./classes/historian.js";
import { Tag } from "./classes/tag.js";
import { Auth } from "./classes/auth.js";
import { Processes } from "./classes/processes.js";
import { Logger, type ProcessLogSink } from "./classes/logger.js";

const MACHHUB_SDK_PATH = "machhub";

// Core HTTP client class
class HTTPClient {
  private httpService: HTTPService;

  /**
   * Creates a new HTTPClient instance
   * @param applicationID The ID for your application (required)
   * @param httpUrl The base URL for HTTP connection (default = http://localhost:6188)
   */
  constructor(applicationID: string, httpUrl: string, developerKey?: string, runtimeID?: string) {
    this.httpService = new HTTPService(httpUrl, MACHHUB_SDK_PATH, applicationID, developerKey, runtimeID);
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
  static async getInstance(applicationID?: string, mqttUrl: string = "ws://localhost:180", developerKey?: string): Promise<MQTTClient> {
    // if (!applicationID) {
    //   applicationID = process.env.APP_ID;
    //   if (!applicationID) {
    //     throw new Error("Application ID is required. Set it via the APP_ID environment variable or pass it as a parameter.");
    //   }
    // }
    if (!this.instance) {
      const mqttService = await MQTTService.getInstance(mqttUrl, developerKey);
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
   * @param retain Whether the broker should retain the message (default: true)
   */
  async publish(topic: string, data: any, retain: boolean = true): Promise<any> {
    return this.mqttService.publish(topic, data, retain);
  }
}

export interface SDKConfig {
  application_id: string;
  developer_key?: string;
  httpUrl?: string;
  mqttUrl?: string;
}

// SDK Class
export class SDK {
  private http: HTTPClient | null = null;
  private mqtt: MQTTClient | null = null;
  private _historian: Historian | null = null;
  private _tag: Tag | null = null;
  private _auth: Auth | null = null;
  private _processes: Processes | null = null;
  // Constructed eagerly, unlike the services above: `log` needs no HTTP or MQTT
  // client, so it must work before (and without) Initialize.
  private _log: Logger = new Logger();
  // Same reasoning: the environment is already present in the process, so
  // reading it must not depend on a client being initialized.
  private _env: Env = new Env();
  private applicationID: string = "";

  /**
   * Extracts the application ID from a runtime ID.
   * Runtime ID format: {applicationID}XmchX{randomID}
   * @param runtimeID The runtime ID to extract from
   * @returns The extracted application ID, or empty string if invalid format
   */
  private extractApplicationIDFromRuntimeID(runtimeID: string): string {
    if (!runtimeID) return "";
    const parts = runtimeID.split('XmchX');
    return parts.length > 0 ? parts[0] : "";
  }

  /**
   * Initializes the SDK with the required clients.
   *
   * Example usage:
   * ```typescript
   * import { SDK, type SDKConfig } from '@machhub-dev/sdk-ts';
   *
   * const config: SDKConfig = {
   *   application_id: 'your-app-id',
   *   httpUrl: 'http://localhost:6188', // optional (default = http://localhost:6188)
   *   mqttUrl: 'ws://localhost:180',  // optional (default = ws://localhost:180)
   * };
   *
   * const sdk = new SDK();
   * await sdk.Initialize(config);
   * ```
   *
   * @param config {SDKConfig} The configuration object containing initialization parameters. See SDKConfig for details.
   * @returns {Promise<boolean>} Resolves to true if initialization is successful.
   */
  public async Initialize(config?: SDKConfig): Promise<boolean> {
    try {
      // console.log("Initializing SDK with config:", config)

      // Methods to initialize config 
      // 1. Via application_id + URLs + developer key passed in config parameter
      // 2. Via development server - Set via Extension/ 
      //          API to get Config (All SDK URLs default to localhost with port from querying current window or 61888)
      if (config === undefined) config = { application_id: "" }
      if (!config.application_id) config = { application_id: "" }

      const envCfg = await getEnvConfig();
      // Extract application_id from runtimeID if not provided in config
      const application_id = config.application_id ||
        this.extractApplicationIDFromRuntimeID(envCfg.runtimeID);

      this.applicationID = application_id;

      // Determine the hostname - use window.location in browser, otherwise fallback to localhost
      const hostname = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
      const secured = typeof window !== 'undefined' ? window.location.protocol === 'https:' : false;

      let host = hostname;
      if (envCfg.hostingMode === 'port' || !envCfg.hostingMode) {
        if (typeof window !== 'undefined' && envCfg.port !== '61888') {
          // Behind a reverse proxy (e.g. Caddy on :443): use window.location.host which correctly
          // omits the internal port (e.g. "machhub.dev" instead of "machhub.dev:6190")
          host = window.location.host;
        } else {
          // Dev server (default port 61888) or non-browser: use explicit hostname:port
          host = `${hostname}:${envCfg.port}`;
        }
      } else if (envCfg.hostingMode === 'path') {
        host += envCfg.pathHosted;
      }

      if (!config.httpUrl) {
        const httpHost = envCfg.hostingMode === 'path' ? `${host}/` : host;
        config.httpUrl = `${secured ? 'https' : 'http'}://${httpHost}`;
      }

      if (!config.mqttUrl) {
        config.mqttUrl = `${secured ? 'wss' : 'ws'}://${host}/mqtt`;
      }

      const { httpUrl, mqttUrl } = config;

      console.log("SDK Config:", { application_id: this.applicationID, httpUrl, mqttUrl, developer_key: config.developer_key?.split('').map((_, i) => i < config!.developer_key!.length - 4 ? '*' : config!.developer_key![i]).join('') });

      this.http = new HTTPClient(this.applicationID, httpUrl, config.developer_key, envCfg.runtimeID);
      this.mqtt = await MQTTClient.getInstance(this.applicationID, mqttUrl, config.developer_key);

      this._historian = new Historian(this.http["httpService"], this.mqtt["mqttService"]);
      this._tag = new Tag(this.http["httpService"], this.mqtt["mqttService"]);
      this._auth = new Auth(this.http["httpService"], this.applicationID);
      this._processes = new Processes(this.http["httpService"]);
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
   * Getter for `processes`. Ensures `processes` is accessed only after initialization.
   */
  public get processes(): Processes {
    if (!this._processes) {
      throw new Error("SDK is not initialized. Call `Initialize` before accessing `processes`.");
    }
    return this._processes;
  }

  /**
   * Getter for `log`. Available without initialization.
   *
   * Inside MACHHUB process code, lines written here go to that process's own log
   * rather than the shared domain worker log that `console.log` writes to.
   * Elsewhere the calls fall through to `console`.
   *
   * @example
   * ```typescript
   * sdk.log.info("reconciled", rows.length, "rows");
   * sdk.log.error(err);
   * ```
   */
  public get log(): Logger {
    return this._log;
  }

  /**
   * Getter for `env`. Available without initialization.
   *
   * Reads the environment variables and secrets configured for this domain
   * under Processes → Environment.
   *
   * @example
   * ```typescript
   * const key = sdk.env.require('ERP_API_KEY');
   * ```
   */
  public get env(): Env {
    return this._env;
  }

  /**
   * Installs the transport that delivers `sdk.log` output to the MACHHUB host.
   * Called by the process worker at startup; process code never needs this.
   * @internal
   */
  public __attachProcessLogger(sink: ProcessLogSink | null): void {
    this._log.attach(sink);
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

  /**
   * Creates a Bridge instance for reading the external database behind one
   * Data Bridge.
   *
   * Reads only — the statement runs inside a READ ONLY transaction on the
   * server. The point of routing through here rather than connecting with your
   * own MySQL client is the credential: MACHHUB keeps the bridge password
   * sealed and never returns it, so a direct connection would mean a second,
   * unsealed copy of it in your process code.
   *
   * @param bridgeID {string} The Data Bridge record ID, e.g. "databridges:erp".
   * @returns {Bridge} An instance of Bridge.
   *
   * @example
   * ```typescript
   * const { rows } = await sdk.bridge('databridges:erp')
   *   .query('SELECT machine, qty FROM work_orders WHERE shift_date = ?', [today]);
   * ```
   */
  public bridge(bridgeID: string): Bridge {
    if (!this.http) {
      throw new Error("SDK is not initialized. Call `Initialize` before accessing bridge.");
    }
    return new Bridge(this.http["httpService"], bridgeID);
  }
}

interface RUNTIME_CONFIG {
  runtimeID: string;
  port: string;
  hostingMode?: 'port' | 'path';
  pathHosted?: string;
}

async function getEnvConfig(): Promise<RUNTIME_CONFIG> {
  try {
    // Try to find the configuration endpoint by testing different base paths
    const configUrl = await findConfigEndpoint();
    // console.log(`Fetching runtime configuration from: ${configUrl}`);
    const response = await fetchData<RUNTIME_CONFIG>(configUrl);
    // console.log('response: ', response);
    // console.log('applicationID: ', response.runtimeID.split('XmchX')[0]);
    return response;
  } catch (error) {
    // console.log('No configured runtime ID:', error);
    // TODO: Use DevPort from SDK Config or default to 61888
    return { port: "61888", runtimeID: "" };
  }
}

/**
 * Attempts to find the correct configuration endpoint by trying different base paths
 * Handles both port-based hosting (direct) and path-based hosting (reverse proxy)
 */
async function findConfigEndpoint(): Promise<string> {
  const origin = window.location.origin;
  const pathname = window.location.pathname;

  // List of potential base paths to try, ordered by likelihood
  const basePaths = [
    // 1. Try origin directly (for port-based hosting like localhost:6190)
    origin,

    // 2. Try current path segments for path-based hosting
    ...generatePathCandidates(pathname),

    // 3. Try common root paths as fallback
    origin,
  ];

  // Remove duplicates while preserving order
  const uniqueBasePaths = [...new Set(basePaths)];

  for (const basePath of uniqueBasePaths) {
    try {
      const configUrl = `${basePath}/_cfg`;

      // Test if this endpoint returns valid JSON config by making a GET request
      const testResponse = await fetch(configUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(2000)
      }).catch(() => null); // Catch fetch errors silently

      if (!testResponse || !testResponse.ok) {
        continue; // Skip to next candidate
      }

      // Validate that the response is JSON and contains the expected 'port' field
      const contentType = testResponse.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        try {
          const testData = await testResponse.json();
          // Check if the response has the expected structure with a 'port' field
          // TODO: Allow checks for path based hosting as well
          if (testData && typeof testData === 'object' && 'port' in testData) {
            // console.log(`Found config endpoint at: ${configUrl}`);
            return configUrl;
          }
        } catch (jsonError) {
          // Not valid JSON, continue to next candidate
          continue;
        }
      }
    } catch (error) {
      // Continue to next candidate
      continue;
    }
  }

  // If all attempts fail, default to origin + /_cfg
  console.warn('Could not find config endpoint, using default origin');
  return `${origin}/_cfg`;
}

/**
 * Generates potential base path candidates from the current pathname
 * For example, /demo2/homepage/settings would generate:
 * - http://localhost/demo2/homepage
 * - http://localhost/demo2
 * - http://localhost
 */
function generatePathCandidates(pathname: string): string[] {
  const origin = window.location.origin;
  const pathSegments = pathname.split('/').filter(segment => segment.length > 0);
  const candidates: string[] = [];

  // Generate paths by progressively removing segments from the end
  for (let i = pathSegments.length; i > 0; i--) {
    const path = '/' + pathSegments.slice(0, i).join('/');
    candidates.push(origin + path);
  }

  return candidates;
}


async function fetchData<T>(url: string, options?: RequestInit): Promise<T> {
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(5000), // 5 second timeout
      ...options
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data: T = await response.json();
    return data;
  } catch (error) {
    throw error;
  }
}

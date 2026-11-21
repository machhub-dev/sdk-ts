import { HTTPService } from "../services/http.service.js";
import { MQTTService } from "../services/mqtt.service.js";
import type { TagMessageMeta } from "../types/tag.models.js";

export class Tag {
  private httpService: HTTPService;
  private mqttService: MQTTService | null;

  constructor(httpService: HTTPService, mqttService: MQTTService | null) {
    this.httpService = httpService;
    this.mqttService = mqttService;
  }

  /** Whether the live-data (MQTT) connection is up now. False before it first connects. */
  get connected(): boolean {
    return this.mqttService?.connected ?? false;
  }

  /**
   * Calls `listener` with the live-data connection state now and whenever it
   * changes, so a screen can show comms loss. Returns a function that stops it.
   */
  onConnectionChange(listener: (connected: boolean) => void): () => void {
    if (!this.mqttService) {
      listener(false);
      return () => {};
    }
    return this.mqttService.onConnectionChange(listener);
  }

  async getAllTags(): Promise<string[]> {
    return this.httpService.request.get("tag/list");
  }

  async publish(topic: string, data: any, retain: boolean = true): Promise<void> {
    if (!this.mqttService) {
      throw new Error("MQTT service not connected");
    }
    this.mqttService.publish(topic, data, retain);
  }

  /**
   * Calls `callback` with each value on `topic` (`+` and `#` allowed). The
   * third argument is what MACHHUB says about the value: its quality and the
   * device's timestamp, when an adapter read it.
   */
  async subscribe(topic: string, callback: (data: any, topic?: string, meta?: TagMessageMeta) => void): Promise<void> {
    if (!this.mqttService) {
      throw new Error("MQTT service not connected");
    }
    this.mqttService.addTopicHandler(topic, callback);
  }

  async unsubscribe(topic: string): Promise<void> {
    if (!this.mqttService) {
      throw new Error("MQTT service not connected");
    }
    this.mqttService.removeTopicHandler(topic);
  }
}

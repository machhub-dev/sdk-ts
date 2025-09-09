import { HTTPService } from "../services/http.service.js";
import { MQTTService } from "../services/mqtt.service.js";

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

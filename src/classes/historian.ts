import { HTTPService } from "../services/http.service";
import { MQTTService } from "../services/mqtt.service";
import { HistorizedData } from "../types/tag.models";

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

  async getHistoricalData(topic: string, start_time: string, range?: string): Promise<HistorizedData[]> {
    return this.httpService.request.withJSON({
      topic: topic,
      start_time: start_time,
      range: range,
    }).patch("historian");
  }

  async subscribeLiveData(topic: string, callback: (data: any) => void): Promise<any> {
    if (!this.mqttService) {
      throw new Error("MQTT service not connected");
    }
    this.mqttService.addTopicHandler(topic, callback);
  }
}

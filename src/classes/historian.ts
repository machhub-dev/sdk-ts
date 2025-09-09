import { HTTPService } from "../services/http.service.js";
import { MQTTService } from "../services/mqtt.service.js";
import { HistorizedData } from "../types/tag.models.js";

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

  async getHistoricalData(topic: string, start_time: Date, range?: string): Promise<HistorizedData[]> {
    let isoStartTime = start_time.toISOString();
    return this.httpService.request.withJSON({
      topic: topic,
      start_time: isoStartTime,
      range: range,
    }).patch("historian");
  }

  async subscribeLiveData(topic: string, callback: (data: any) => void): Promise<any> {
    if (!this.mqttService) {
      throw new Error("MQTT service not connected");
    }
    this.mqttService.addTopicHandler(topic, callback);
  }

  async getLastNValues(topic: string, n: number): Promise<HistorizedData[]> {
    if (n <= 0) {
      throw new Error("The number of values to fetch must be greater than 0.");
    }

    if (n > 100){
      throw new Error("The number of values to fetch must be less than 100.");
    }

    return this.httpService.request.withJSON({
      topic: topic,
      limit: n,
      sort: "desc", // Fetch the latest values
    }).patch("historian/last");
  }
}

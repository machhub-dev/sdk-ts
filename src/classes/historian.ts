import { HTTPService } from "../services/http.service.js";
import { MQTTService } from "../services/mqtt.service.js";
import { HistorizedData } from "../types/tag.models.js";

interface AggregationOption {
  mean: "mean",
  sum: "sum",
  min: "min",
  max: "max",
  median: "median",
}


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

    if (n > 100) {
      throw new Error("The number of values to fetch must be less than 100.");
    }

    return this.httpService.request.withJSON({
      topic: topic,
      limit: n,
      sort: "desc", // Fetch the latest values
    }).patch("historian/last");
  }

  async query(SurrealQL: string): Promise<any> {
    return this.httpService.request.withJSON({
      query: SurrealQL
    }).post("historian/query");
  }

  /**
   * Export historized data for one or more topics as a gzipped CSV file (Blob).
   * When multiple topics are provided, they are merged into a single CSV with columns: [Timestamp, topic1, topic2, ...].
   * Supports optional time bucketing (sampleRate) and aggregation (mean, sum, min, max, median).
   *
   * @param topics - Array of topic strings to export
   * @param startDate - Start date for the data range
   * @param endDate - End date for the data range
   * @param timezone - Optional Timezone string (e.g. "Asia/Kuala Lumpur")
   * @param sampleRate - Optional bucket interval in underscore format (e.g. "5_second", "1_minute", "1_hour")
   * @param aggregation - Optional aggregation function: "mean" | "sum" | "min" | "max" | "median" | "none"
   * @param mapping - Optional key-value pairs to rename topic columns in the CSV header (e.g. { "Sensor/Temperature": "Temp °C" })
   * @returns A Blob containing the gzipped CSV data
   */
  async getHistoricalDataAsCSV(
    topics: string[],
    startDate: Date,
    endDate: Date,
    timezone?: string,
    sampleRate?: string,
    aggregation?: AggregationOption,
    mapping?: Record<string, string>,
  ): Promise<Blob> {
    return this.httpService.request.withJSON({
      topics,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      timezone,
      sampleRate: sampleRate ?? "",
      aggregation: aggregation ?? "",
      mapping: mapping ?? {},
    }).postAsBlob("historian/export/aggregated");
  }
}

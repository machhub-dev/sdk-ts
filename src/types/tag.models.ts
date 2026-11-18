export interface HistorizedData{
    timestamp: string,
    value: unknown,
} 
/** How far a live value can be trusted, as the MACHHUB adapter that read it says. */
export type TagQuality = "good" | "uncertain" | "bad";

/**
 * What MACHHUB says about one live value, beside the value itself. Every field
 * is absent when unknown: a value a client published, an MQTT 3 path, or a
 * server that does not send it.
 */
export interface TagMessageMeta {
  /** From the adapter that read the value (MQTT 5 user property mh-q). */
  quality?: TagQuality;
  /** When the device produced the value, RFC 3339 (mh-src-ts). */
  sourceTime?: string;
  /** OPC UA StatusCode when not zero (mh-status). */
  status?: number;
  /** True when this is the broker's retained copy, delivered on subscribe. */
  retained: boolean;
}

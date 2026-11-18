import { RecordID } from "./recordID.models.js";

/** Alarm priority, most severe first: critical, high, medium, low. */
export type AlarmPriority = "critical" | "high" | "medium" | "low";

/**
 * Where an alarm is in its ISA-18.2 lifecycle.
 * - `normal`: condition false, nothing to do.
 * - `unack`: condition true (or returned) and not yet acknowledged.
 * - `ack`: acknowledged while the condition is still true.
 * - `cleared`: condition false but still waiting for an acknowledgement.
 * - `shelved`: suppressed by an operator until `shelvedUntil`.
 */
export type AlarmStateName = "normal" | "unack" | "ack" | "cleared" | "shelved";

/** A journal entry's kind. */
export type AlarmEventType =
  | "raised" | "retriggered" | "cleared" | "acknowledged" | "resolved"
  | "shelved" | "unshelved" | "shelve_expired" | "enabled" | "disabled"
  | "rule_created" | "rule_updated" | "rule_deleted";

/** An alarm rule as configured in MACHHUB (read-only through the SDK). */
export interface AlarmRule {
  id?: RecordID;
  name: string;
  description?: string;
  /** The exact UNS topic the rule watches. */
  tag: string;
  equipment?: string;
  area?: string;
  operator: string;
  setpoint?: number;
  deadband?: number;
  targetString?: string;
  priority: AlarmPriority;
  message?: string;
  unit?: string;
  decimalPlaces?: number;
  onDelaySeconds?: number;
  offDelaySeconds?: number;
  /** Absent means true. */
  requireAck?: boolean;
  /** Absent means true. */
  allowShelve?: boolean;
  maxShelveMinutes?: number;
  notify: boolean;
  /** Absent means true. */
  enabled?: boolean;
}

/** A rule's current state. Times are ISO 8601 strings. */
export interface AlarmState {
  ruleID: RecordID;
  state: AlarmStateName;
  activeSince?: string;
  clearedAt?: string;
  ackedAt?: string;
  ackedBy?: string;
  ackComment?: string;
  shelvedUntil?: string;
  shelvedFrom?: AlarmStateName;
  shelvedBy?: string;
  shelveReason?: string;
  /** Activations since the alarm was last resolved; a high count means chattering. */
  count: number;
  occurrenceID?: RecordID;
  /** Latest reading, reduced to a scalar. */
  value?: unknown;
  valueAt?: string;
}

/** One row of the live list: a rule and its state (null before the first evaluation). */
export interface AlarmLive {
  rule: AlarmRule;
  state: AlarmState | null;
}

/** The Workspace's live alarm list. `version` rises on every change. */
export interface AlarmLiveSnapshot {
  version: number;
  serverTime: string;
  alarms: AlarmLive[];
}

/** One episode of an alarm, from raise to resolution. */
export interface AlarmOccurrence {
  id?: RecordID;
  ruleID: RecordID;
  name: string;
  tag: string;
  equipment?: string;
  area?: string;
  priority: AlarmPriority;
  message?: string;
  unit?: string;
  condition?: string;
  raisedAt: string;
  raiseValue?: unknown;
  peakValue?: number;
  clearedAt?: string;
  ackedAt?: string;
  ackedBy?: string;
  ackComment?: string;
  resolvedAt?: string;
  retrips: number;
  shelved?: boolean;
  closedReason?: string;
}

/** One line of the alarm journal. */
export interface AlarmEvent {
  id?: RecordID;
  ruleID?: RecordID;
  occurrenceID?: RecordID;
  at: string;
  type: AlarmEventType;
  name: string;
  tag?: string;
  equipment?: string;
  area?: string;
  priority?: AlarmPriority;
  state?: AlarmStateName;
  value?: unknown;
  user?: string;
  comment?: string;
  seq: number;
}

export interface AlarmPage<T> {
  items: T[];
  total: number;
}

/** Filters for {@link Alarms.occurrences} and {@link Alarms.events}. */
export interface AlarmHistoryQuery {
  start?: Date;
  end?: Date;
  priorities?: AlarmPriority[];
  ruleID?: string | RecordID;
  search?: string;
  /** Journal only. */
  types?: AlarmEventType[];
  /** Occurrences only: those not yet resolved. */
  openOnly?: boolean;
  /** Default "desc" (newest first). */
  order?: "asc" | "desc";
  /** Default 50, at most 1000. */
  limit?: number;
  offset?: number;
}

/** Per rule, whether an operator action applied, and why not where it did not. */
export interface AlarmActionResult {
  applied: string[];
  skipped?: Record<string, string>;
}

/** Options for {@link Alarms.subscribe}. */
export interface AlarmSubscribeOptions {
  /** Only alarms that are not normal. Default false. */
  activeOnly?: boolean;
  /** Poll interval in milliseconds. Default 2000, at least 500. */
  intervalMs?: number;
  /** Called when a poll fails; polling continues. */
  onError?: (error: unknown) => void;
}

import { HTTPService } from "../services/http.service.js";
import { RecordID, RecordIDToString } from "../types/recordID.models.js";
import {
  AlarmActionResult,
  AlarmEvent,
  AlarmHistoryQuery,
  AlarmLiveSnapshot,
  AlarmOccurrence,
  AlarmPage,
  AlarmSubscribeOptions,
} from "../types/alarm.models.js";

type RuleRef = string | RecordID;

const ruleString = (id: RuleRef) => (typeof id === "string" ? id : RecordIDToString(id));

function ruleList(ids: RuleRef | RuleRef[]): string[] {
  const list = (Array.isArray(ids) ? ids : [ids]).map(ruleString).filter((s) => s.trim() !== "");
  if (list.length === 0) throw new Error("Name at least one alarm rule.");
  return list;
}

function historyParams(q: AlarmHistoryQuery): Record<string, string> {
  const p: Record<string, string> = {};
  if (q.start) p.start = q.start.toISOString();
  if (q.end) p.end = q.end.toISOString();
  if (q.priorities?.length) p.priority = q.priorities.join(",");
  if (q.types?.length) p.types = q.types.join(",");
  if (q.ruleID) p.ruleID = ruleString(q.ruleID);
  if (q.search) p.search = q.search;
  if (q.openOnly) p.open = "true";
  if (q.order) p.order = q.order;
  if (q.limit !== undefined) p.limit = String(q.limit);
  if (q.offset !== undefined) p.offset = String(q.offset);
  return p;
}

/**
 * The Workspace's alarms, from MACHHUB's ISA-18.2 alarm engine: the live list,
 * history, and the operator's acknowledge and shelve. Rules are configured in
 * MACHHUB, not here.
 *
 * Reading needs the dashboard feature; acknowledging and shelving need it at
 * read-write. A hosted app acts as its signed-in user. Needs the alarms
 * licence module, and a server with the SDK alarm routes (MACHHUB 2).
 */
export class Alarms {
  private httpService: HTTPService;

  constructor(httpService: HTTPService) {
    this.httpService = httpService;
  }

  /** The live list: every rule with its current state. */
  async live(options: { activeOnly?: boolean } = {}): Promise<AlarmLiveSnapshot> {
    const query = options.activeOnly ? { activeOnly: "true" } : undefined;
    const res = await this.httpService.request.get<AlarmLiveSnapshot>("alarms/live", query);
    return { ...res, alarms: res?.alarms ?? [] };
  }

  /**
   * Calls `callback` with the live list now and again whenever it changes.
   * The server has no alarm push yet, so this polls `live` and compares the
   * snapshot's version. Returns a function that stops it.
   */
  subscribe(callback: (snapshot: AlarmLiveSnapshot) => void, options: AlarmSubscribeOptions = {}): () => void {
    const interval = Math.max(500, options.intervalMs ?? 2000);
    let stopped = false;
    let lastVersion: number | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      try {
        const snap = await this.live({ activeOnly: options.activeOnly });
        if (!stopped && snap.version !== lastVersion) {
          lastVersion = snap.version;
          callback(snap);
        }
      } catch (error) {
        if (!stopped) options.onError?.(error);
      }
      if (!stopped) timer = setTimeout(tick, interval);
    };
    void tick();

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }

  /** Alarm episodes, raise to resolution, newest first unless `order` is "asc". */
  async occurrences(query: AlarmHistoryQuery = {}): Promise<AlarmPage<AlarmOccurrence>> {
    const res = await this.httpService.request.get<AlarmPage<AlarmOccurrence>>("alarms/occurrences", historyParams(query));
    return { items: res?.items ?? [], total: res?.total ?? 0 };
  }

  /** The alarm journal: every transition and operator action. */
  async events(query: AlarmHistoryQuery = {}): Promise<AlarmPage<AlarmEvent>> {
    const res = await this.httpService.request.get<AlarmPage<AlarmEvent>>("alarms/events", historyParams(query));
    return { items: res?.items ?? [], total: res?.total ?? 0 };
  }

  /** Acknowledges one or more alarms by rule id. The comment is journalled. */
  async ack(ruleIDs: RuleRef | RuleRef[], comment?: string): Promise<AlarmActionResult> {
    return this.action("alarms/ack", { ruleIDs: ruleList(ruleIDs), comment });
  }

  /** Shelves alarms for `minutes` (capped by each rule's maximum). */
  async shelve(ruleIDs: RuleRef | RuleRef[], minutes: number, comment?: string): Promise<AlarmActionResult> {
    if (!Number.isFinite(minutes) || minutes <= 0) throw new Error("Shelve for a positive number of minutes.");
    return this.action("alarms/shelve", { ruleIDs: ruleList(ruleIDs), minutes: Math.round(minutes), comment });
  }

  /** Returns shelved alarms to service. */
  async unshelve(ruleIDs: RuleRef | RuleRef[]): Promise<AlarmActionResult> {
    return this.action("alarms/unshelve", { ruleIDs: ruleList(ruleIDs) });
  }

  private async action(path: string, body: Record<string, unknown>): Promise<AlarmActionResult> {
    if (body.comment === undefined) delete body.comment;
    const res = await this.httpService.request.withJSON(body).post<AlarmActionResult>(path);
    return { applied: res?.applied ?? [], ...(res?.skipped ? { skipped: res.skipped } : {}) };
  }
}

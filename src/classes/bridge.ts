import { HTTPService, HTTPException } from "../services/http.service.js";
import type { BridgeQueryOptions, BridgeQueryResult } from "../types/bridge.models.js";

/**
 * A query that the bridge or its database refused.
 *
 * `status` is what tells you whether to fix the query or wait: 400 means the
 * statement was rejected (bad SQL, or a write — this endpoint is read-only),
 * 503 means the database was unreachable and the same query may well succeed
 * later.
 */
export class BridgeQueryError extends Error {
  public bridgeID: string;
  public sql: string;
  public status?: number;
  public originalError: Error;

  constructor(bridgeID: string, sql: string, originalError: Error) {
    const detail = originalError instanceof HTTPException ? originalError.body : originalError.message;
    super(`Data Bridge query failed on '${bridgeID}': ${detail}`);
    this.name = "BridgeQueryError";
    this.bridgeID = bridgeID;
    this.sql = sql;
    this.status = originalError instanceof HTTPException ? originalError.status : undefined;
    this.originalError = originalError;
  }

  /** True when retrying later is the sensible response. */
  public get transient(): boolean {
    return this.status === 503;
  }
}

/**
 * Reads the external database behind one Data Bridge.
 *
 * The bridge writes MACHHUB's tag data into a database you own — this is how
 * process code reads it back without a second copy of the bridge credential
 * living in the process file. MACHHUB holds that password sealed and never
 * hands it out; queries go through the bridge's existing connection instead.
 *
 * Reads only. The statement runs inside a READ ONLY transaction, so INSERT,
 * UPDATE, DELETE and DDL are refused by the database itself, not merely
 * discouraged here. Writing to the external database is what egress routes are
 * for.
 *
 * @example
 * ```typescript
 * const bridge = sdk.bridge('databridges:erp');
 *
 * const { rows } = await bridge.query<{ machine: string; qty: number }>(
 *   'SELECT machine, SUM(qty) AS qty FROM work_orders WHERE shift_date = ? GROUP BY machine',
 *   [today],
 * );
 *
 * for (const row of rows) sdk.log.info(row.machine, row.qty);
 * ```
 */
export class Bridge {
  private httpService: HTTPService;
  private bridgeID: string;

  constructor(httpService: HTTPService, bridgeID: string) {
    this.httpService = httpService;
    this.bridgeID = bridgeID;
  }

  /**
   * Runs one read and returns the rows with their column order and row count.
   *
   * @param sql A single read statement (SELECT, WITH, SHOW, DESCRIBE, EXPLAIN).
   *            Use `?` placeholders and pass values in `params` — never build a
   *            WHERE clause by string concatenation.
   * @param params Values bound positionally to the `?` placeholders.
   * @param options `limit` caps the rows returned (default 500, max 10,000).
   * @throws {BridgeQueryError} when the statement or the database refuses it.
   */
  async query<Row = Record<string, unknown>>(
    sql: string,
    params: unknown[] = [],
    options: Omit<BridgeQueryOptions, "params"> = {},
  ): Promise<BridgeQueryResult<Row>> {
    try {
      return await this.httpService.request
        .withJSON({
          sql,
          params,
          ...(options.limit !== undefined ? { limit: options.limit } : {}),
        })
        .post<BridgeQueryResult<Row>>(`databridge/${encodeURIComponent(this.bridgeID)}/query`);
    } catch (e: any) {
      throw new BridgeQueryError(this.bridgeID, sql, e);
    }
  }

  /**
   * Runs one read and returns just the rows.
   *
   * The convenience form for the common case. Reach for `query` instead when
   * you need `truncated` — with a `limit` set, `rows` alone cannot tell a
   * complete result from a cut-off one.
   */
  async rows<Row = Record<string, unknown>>(
    sql: string,
    params: unknown[] = [],
    options: Omit<BridgeQueryOptions, "params"> = {},
  ): Promise<Row[]> {
    const result = await this.query<Row>(sql, params, options);
    return result.rows;
  }

  /**
   * Runs one read and returns its first row, or null when there was none.
   *
   * Sends `limit: 1`, so it stays cheap even against a query that would have
   * matched a great many rows. Add your own ORDER BY when "first" needs to mean
   * something specific — without one the database is free to return any row.
   */
  async one<Row = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<Row | null> {
    const result = await this.query<Row>(sql, params, { limit: 1 });
    return result.rows.length > 0 ? result.rows[0] : null;
  }
}

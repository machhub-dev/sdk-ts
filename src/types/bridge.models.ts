/**
 * One read against a Data Bridge's external database.
 *
 * `params` bind positionally to `?` placeholders in the SQL. They are a
 * separate field rather than something you interpolate yourself because process
 * code building a WHERE clause from a tag name or a time range has no safe way
 * to do it by concatenation.
 */
export interface BridgeQueryOptions {
  params?: unknown[];
  /**
   * Maximum rows returned. Defaults to 500 server-side and is capped at 10,000.
   * A result cut short by this comes back with `truncated: true` rather than an
   * error, so a page of data is still usable.
   */
  limit?: number;
}

/** The rows one query returned, plus what you need to know about them. */
export interface BridgeQueryResult<Row = Record<string, unknown>> {
  /**
   * Column names in the order the SELECT produced them, which the row objects
   * cannot preserve. Use this when rendering a table.
   */
  columns: string[];
  rows: Row[];
  rowCount: number;
  /** True when `limit` cut the result short — there is more behind it. */
  truncated: boolean;
  elapsedMs: number;
}

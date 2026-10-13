/**
 * Reads the environment variables and secrets configured for this domain in
 * MACHHUB (Processes → Environment).
 *
 * Today these arrive as ordinary process environment variables, so
 * `process.env.MY_VAR` works just as well. Going through `sdk.env` instead buys
 * one thing: variables are currently scoped to the DOMAIN, shared by every
 * process it runs, and if per-process scoping is ever added it will arrive
 * through here rather than through the environment. Code written against
 * `sdk.env` keeps working; code written against `process.env` has to be found
 * and changed.
 *
 * Values are never fetched over HTTP — this reads the environment the worker
 * was started with, so there is no request and nothing to await.
 *
 * @example
 * ```typescript
 * const key = sdk.env.require('ERP_API_KEY');   // throws if unset
 * const url = sdk.env.get('ERP_URL', 'http://localhost:8080');
 * ```
 */
export class Env {
  /**
   * Returns a variable's value, or `fallback` when it is unset or empty.
   *
   * An empty string counts as unset on purpose: an environment variable saved
   * with a blank value is almost always a half-finished configuration, and
   * treating it as a real value turns that into a confusing downstream failure
   * rather than a fallback.
   */
  get(name: string, fallback?: string): string | undefined {
    const value = typeof process !== "undefined" && process.env ? process.env[name] : undefined;
    return value !== undefined && value !== "" ? value : fallback;
  }

  /**
   * Returns a variable's value, or throws when it is unset.
   *
   * Prefer this for anything the process cannot run without — a credential, an
   * endpoint. Failing at the top with the variable's name is far easier to
   * diagnose than the 401 you get several calls later from sending `undefined`.
   */
  require(name: string): string {
    const value = this.get(name);
    if (value === undefined) {
      throw new Error(
        `Environment variable '${name}' is not set. Add it under Processes → Environment in MACHHUB.`,
      );
    }
    return value;
  }

  /** Whether a variable is set to a non-empty value. */
  has(name: string): boolean {
    return this.get(name) !== undefined;
  }
}

/** Severity of a process log line. */
export type ProcessLogLevel = "debug" | "info" | "warn" | "error";

/**
 * Transport that delivers a log line to the MACHHUB host.
 *
 * Supplied by the process worker at startup — the SDK itself has no way to reach
 * the per-process log stream, so without a sink the logger falls back to the
 * console.
 */
export type ProcessLogSink = (level: ProcessLogLevel, args: unknown[]) => void;

/**
 * Logger for MACHHUB process code, reached as `sdk.log`.
 *
 * Inside a process, lines written here go to that process's **own** log — the one
 * shown for it in the Processes page — rather than being mixed into the shared
 * domain worker log that `console.log` writes to.
 *
 * Anywhere else (a browser app, a script), there is no process to log against, so
 * the calls fall through to the matching `console` method.
 *
 * @example
 * ```typescript
 * sdk.log.info("starting reconciliation", { batch: batchId });
 * sdk.log.warn("tank pressure near limit", pressure);
 * sdk.log.error(err);
 * ```
 */
export class Logger {
  private sink: ProcessLogSink | null = null;

  /**
   * Installs the transport used to deliver log lines. Called by the process
   * worker; process code never needs this.
   * @internal
   */
  public attach(sink: ProcessLogSink | null): void {
    this.sink = sink;
  }

  /** True when running somewhere log lines reach a process log. */
  public get isAttached(): boolean {
    return this.sink !== null;
  }

  /** Logs at debug level — verbose detail, usually only wanted while diagnosing. */
  public debug(...args: unknown[]): void {
    this.emit("debug", args, console.debug);
  }

  /** Logs at info level. */
  public info(...args: unknown[]): void {
    this.emit("info", args, console.info);
  }

  /** Logs at warn level — something unexpected that did not stop execution. */
  public warn(...args: unknown[]): void {
    this.emit("warn", args, console.warn);
  }

  /** Logs at error level. */
  public error(...args: unknown[]): void {
    this.emit("error", args, console.error);
  }

  private emit(level: ProcessLogLevel, args: unknown[], fallback: (...args: unknown[]) => void): void {
    if (!this.sink) {
      fallback(...args);
      return;
    }
    try {
      this.sink(level, args);
    } catch (err) {
      // A failing log transport must never break the code that called it.
      console.error("Failed to deliver process log:", err);
    }
  }
}

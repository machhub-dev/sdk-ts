import { HTTPService } from "../services/http.service.js";

export interface ServerInfo {
  version?: string;
  capabilities: string[];
  device_name?: string;
  [key: string]: unknown;
}

/**
 * Inspects the connected MACHHUB server's version and advertised capabilities.
 * Older servers that do not expose `capabilities` (or lack `/machhub/info`)
 * gracefully resolve to an empty list rather than throwing.
 */
export class Server {
  private httpService: HTTPService;
  private cachedCapabilities: string[] | null = null;

  constructor(httpService: HTTPService) {
    this.httpService = httpService;
  }

  /**
   * Fetches `/machhub/info`. Normalizes `capabilities` to a string array
   * (empty when absent on older servers).
   */
  public async info(): Promise<ServerInfo> {
    const raw = await this.httpService.request.get<Record<string, unknown>>("info");
    const caps = Array.isArray(raw?.capabilities)
      ? raw.capabilities.filter((c): c is string => typeof c === "string")
      : [];
    this.cachedCapabilities = caps;
    return {
      ...(raw ?? {}),
      version: typeof raw?.version === "string" ? raw.version : undefined,
      device_name: typeof raw?.device_name === "string" ? raw.device_name : undefined,
      capabilities: [...caps],
    };
  }

  /**
   * Returns the server's capability list (cached after the first fetch unless
   * `refresh` is true). Returns an empty list against older servers without
   * `capabilities` or `/machhub/info`.
   */
  public async capabilities(refresh = false): Promise<string[]> {
    if (!refresh && this.cachedCapabilities !== null) {
      return [...this.cachedCapabilities];
    }
    try {
      const info = await this.info();
      return info.capabilities;
    } catch {
      this.cachedCapabilities = [];
      return [];
    }
  }

  /**
   * Reports whether the connected server advertises `name`. Returns `false`
   * against older servers without `capabilities`.
   */
  public async has(name: string, refresh = false): Promise<boolean> {
    const caps = await this.capabilities(refresh);
    return caps.includes(name);
  }
}

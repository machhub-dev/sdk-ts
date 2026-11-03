import { HTTPService } from "../services/http.service.js";
import { RecordID } from "../types/recordID.models.js";
import { Item, ItemsQuery, WorkspaceTree } from "../types/workspace.models.js";

/**
 * The Workspace's folders and items (MACHHUB 2). Only what the caller may see
 * is answered: an item in a folder they have no access to is left out.
 *
 * Needs MACHHUB 2; against MACHHUB 1 these calls answer 404.
 */
export class Workspace {
  private httpService: HTTPService;

  constructor(httpService: HTTPService) {
    this.httpService = httpService;
  }

  /** The folders and items the caller can see, with their access on each. */
  async tree(): Promise<WorkspaceTree> {
    return await this.httpService.request.get<WorkspaceTree>("tree");
  }

  /**
   * Items, narrowed: one folder's (`folder`), of one type (`type`), or those
   * whose name contains `query`, up to `limit`.
   */
  async items(options: ItemsQuery = {}): Promise<Item[]> {
    if (options.folder && (options.query || options.limit)) {
      throw new Error("`query` and `limit` cannot be combined with `folder`.");
    }
    const params: Record<string, string> = {};
    if (options.folder) params.folder = options.folder;
    if (options.type) params.type = options.type;
    if (options.query) params.q = options.query;
    if (options.limit !== undefined) params.limit = String(options.limit);
    const res = await this.httpService.request.get<{ items: Item[] | null }>("items", params);
    return res?.items ?? [];
  }

  /** One item by its id, such as "items:abc". */
  async item(id: string | RecordID): Promise<Item> {
    const resolved = typeof id === "string" ? id : `${id.Table}:${id.ID}`;
    return await this.httpService.request.get<Item>(`items/${encodeURIComponent(resolved)}`);
  }
}

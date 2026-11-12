import { HTTPService } from "../services/http.service.js";
import { RecordID } from "../types/recordID.models.js";
import {
  CreateFolderInput,
  Deleted,
  FolderRecord,
  Item,
  ItemRecord,
  ItemsQuery,
  UpdateFolderInput,
  Version,
  VersionSummary,
  WorkspaceTree,
} from "../types/workspace.models.js";

/** "items:abc" from either form of a record id. */
export function recordIDString(id: string | RecordID): string {
  return typeof id === "string" ? id : `${id.Table}:${id.ID}`;
}

const segment = (id: string | RecordID) => encodeURIComponent(recordIDString(id));

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
    return await this.httpService.request.get<Item>(`items/${segment(id)}`);
  }

  /**
   * Makes a folder in `parent`, or in the Workspace's root when there is no
   * parent. Needs edit on the parent; a developer key needs the config write
   * scope. Needs MACHHUB 2.
   */
  async createFolder(input: CreateFolderInput): Promise<FolderRecord> {
    const body: Record<string, unknown> = { name: input.name };
    if (input.parent) body.parent_id = recordIDString(input.parent);
    return await this.httpService.request.withJSON(body).post<FolderRecord>("tree/folders");
  }

  /** Renames a folder. Needs MACHHUB 2. */
  async renameFolder(id: string | RecordID, name: string): Promise<FolderRecord> {
    return await this.updateFolder(id, { name });
  }

  /** Renames a folder or changes its place among its siblings. Needs MACHHUB 2. */
  async updateFolder(id: string | RecordID, input: UpdateFolderInput): Promise<FolderRecord> {
    if (input.name === undefined && input.order === undefined) {
      throw new Error("Nothing to change: give `name`, `order` or both.");
    }
    return await this.httpService.request.withJSON({ ...input }).patch<FolderRecord>(`tree/folders/${segment(id)}`);
  }

  /** Moves a folder, with everything in it, into `parent`. Needs MACHHUB 2. */
  async moveFolder(id: string | RecordID, parent: string | RecordID): Promise<FolderRecord> {
    return await this.httpService.request
      .withJSON({ parent_id: recordIDString(parent) })
      .post<FolderRecord>(`tree/folders/${segment(id)}/move`);
  }

  /** Deletes an empty folder; one with anything in it answers 409. Needs MACHHUB 2. */
  async deleteFolder(id: string | RecordID): Promise<Deleted> {
    return await this.httpService.request.delete<Deleted>(`tree/folders/${segment(id)}`);
  }

  /**
   * Files an item in another folder. The record it stands for is not changed.
   * Needs MACHHUB 2.
   */
  async moveItem(id: string | RecordID, folder: string | RecordID): Promise<ItemRecord> {
    return await this.httpService.request
      .withJSON({ folder_id: recordIDString(folder) })
      .post<ItemRecord>(`items/${segment(id)}/move`);
  }

  /**
   * The versions of a versioned item, newest first, without their content:
   * a collection's schema, a process, an artifact, a report or a workflow.
   * Name it by its record id ("processes:abc") or by its item id, which is
   * read first for the record it stands for. Needs MACHHUB 2.
   */
  async versions(id: string | RecordID): Promise<VersionSummary[]> {
    const subject = await this.versionSubject(id);
    const res = await this.httpService.request.get<{ items: VersionSummary[] | null }>(`versions/${segment(subject)}`);
    return res?.items ?? [];
  }

  /** Version `n` of a versioned item, with its content. Needs MACHHUB 2. */
  async version(id: string | RecordID, n: number): Promise<Version> {
    if (!Number.isInteger(n) || n < 1) throw new Error("A version is a whole number, 1 or more.");
    const subject = await this.versionSubject(id);
    return await this.httpService.request.get<Version>(`versions/${segment(subject)}/${n}`);
  }

  // The server takes the record id only, so its feature check sees the type.
  private async versionSubject(id: string | RecordID): Promise<string> {
    const resolved = recordIDString(id);
    if (!resolved.startsWith("items:")) return resolved;
    return recordIDString((await this.item(resolved)).ref);
  }
}

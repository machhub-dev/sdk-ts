import { RecordID } from "./recordID.models.js";

// MACHHUB 2: a Workspace (what MACHHUB 1 called a domain) holds folders, and
// items in them. An item stands for one collection, dashboard, process,
// artifact or other record. Each answer carries the caller's access level on
// it: "view", "edit" or "manage".

export type AccessLevel = "view" | "edit" | "manage" | string;

/** An item in the Workspace's folder tree. */
export interface Item {
  id: RecordID;
  domain_id: RecordID;
  folder_id: RecordID;
  /** What the item stands for: "collection", "dashboard", "process", ... */
  type: string;
  /** The record the item stands for, such as collections:abc. */
  ref: RecordID;
  name: string;
  icon?: string;
  created_dt?: string;
  updated_dt?: string;
  access: AccessLevel;
}

export interface Folder {
  id: RecordID;
  domain_id: RecordID;
  /** Absent on the root folder. */
  parent_id?: RecordID;
  name: string;
  access: AccessLevel;
  [key: string]: unknown;
}

/** A folder as a change answers it, without the caller's access. */
export type FolderRecord = Omit<Folder, "access">;

/** An item as a move answers it, without the caller's access. */
export type ItemRecord = Omit<Item, "access">;

/** The folders and items the caller can see. */
export interface WorkspaceTree {
  root_id: RecordID;
  folders: Folder[];
  items: Item[];
}

/**
 * Narrows `workspace.items()`. `folder` lists one folder's items; `query`
 * searches names across the Workspace and cannot be combined with `folder`.
 */
export interface ItemsQuery {
  folder?: string;
  type?: string;
  query?: string;
  limit?: number;
}

/** A saved way of showing a collection: a Table, Form or Gallery. */
export interface CollectionView {
  id: string;
  collection: string;
  kind: "table" | "form" | "gallery" | string;
  name: string;
  /** Absent on a shared view. */
  owner?: string;
  is_default?: boolean;
  config: Record<string, unknown>;
  order?: number;
  editable?: boolean;
  deletable?: boolean;
  [key: string]: unknown;
}

/** What `createView` makes. `config` is the view's columns, sort and filters. */
export interface CreateViewInput {
  kind: "table" | "form" | "gallery" | string;
  name: string;
  /** Seen by everyone who can see the collection; needs edit on it. */
  shared?: boolean;
  config?: Record<string, unknown>;
  order?: number;
}

/** What `updateView` changes; at least one. */
export interface UpdateViewInput {
  name?: string;
  config?: Record<string, unknown>;
  order?: number;
}

/** What `createFolder` makes. With no `parent` it goes in the Workspace's root. */
export interface CreateFolderInput {
  name: string;
  parent?: string | RecordID;
}

/** What `updateFolder` changes; at least one. */
export interface UpdateFolderInput {
  name?: string;
  /** Its place among its siblings. */
  order?: number;
}

/** The answer of a delete. */
export interface Deleted {
  id: string;
  deleted: boolean;
}

/** One version of a versioned item, without its content. */
export interface VersionSummary {
  n: number;
  note?: string;
  created_by?: string;
  created_dt?: string;
}

/** One version with its content, as the item's own History tab reads it. */
export interface Version extends VersionSummary {
  content: Record<string, unknown>;
}

/** Narrows `collection.history()`. */
export interface RecordHistoryQuery {
  /** The `next` of the page before. */
  before?: string;
  /** At most 200; 50 when not given. */
  limit?: number;
}

/** One change to a record's values. */
export interface RecordHistoryEntry {
  id: string;
  record: string;
  /** "update" or "delete": `values` are the record's values before it. */
  op: string;
  values: Record<string, unknown>;
  actor?: string;
  call_id?: string;
  created_dt: string;
}

/** A page of a record's history, newest first; `next` is "" on the last. */
export interface RecordHistoryPage {
  items: RecordHistoryEntry[];
  next: string;
}

/** One condition on a record field: { field: "status", op: "eq", value: "open" }. */
export interface KnowledgeFilter {
  /** The collection the field is in, when the search reads several. */
  collection?: string;
  field: string;
  op: string;
  value?: unknown;
}

export interface KnowledgeSearchOptions {
  /** Folder or collection ids to search; empty searches every collection the caller can see. */
  sources?: string[];
  /** Record ids to search within. */
  records?: string[];
  filters?: KnowledgeFilter[];
  /** How many passages to answer with. */
  k?: number;
}

/** A passage that matched, and where it came from. */
export interface KnowledgeHit {
  chunk_id: string;
  text: string;
  collection_id: string;
  collection_name: string;
  record_id: string;
  field: string;
  /** The file the text came from, for a file field. */
  file: string;
  /** Its page, slide or sheet, from 1; 0 when the file has none. */
  page: number;
  /** Fused rank: higher is better, comparable within one answer only. */
  score: number;
  similarity: number;
  link?: string;
  file_url?: string;
  [key: string]: unknown;
}

export interface KnowledgeResults {
  hits: KnowledgeHit[];
  [key: string]: unknown;
}

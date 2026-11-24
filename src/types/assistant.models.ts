/** A source the answer drew on, as the server's provenance gives it. */
export interface AssistantCitation {
  verb?: string;
  row_count?: number;
  note?: string;
  [key: string]: unknown;
}

/** A finished answer. */
export interface AssistantAnswer {
  text: string;
  citations: AssistantCitation[];
  traceId?: string;
  toolCalls?: number;
}

/** A refusal or failure, one line for the operator. */
export interface AssistantError {
  message: string;
  /** "not_ready", "budget", "sign_in", "no_access", "busy", "confirm", "socket" or another server code. */
  code?: string;
}

/**
 * The server asks the operator to confirm a change. The sentence is the
 * server's, filled from the Process's confirm text: show it as it is.
 */
export interface AssistantConfirmRequest {
  actionId: string;
  /** The tool's title, e.g. "Start changeover". */
  tool: string;
  /** e.g. "Start changeover on L3 to SKU 42?" */
  text: string;
  /** After this the change is dropped and nothing runs. */
  expires: Date;
  /** False for a shared (kiosk) login: it may decline, never confirm. */
  canConfirm: boolean;
  /** Confirm the change. Rejects with the server's one-line reason. */
  confirm(): Promise<void>;
  /** Decline: nothing runs. */
  decline(): Promise<void>;
}

/** A tool the app runs itself, in the operator's screen. */
export type AssistantClientTool = (args: Record<string, any>) => unknown | Promise<unknown>;

export interface AssistantAskOptions {
  /** Knowledge sources to narrow to; only the agent's own are used. */
  sources?: string[];
  /** The page the operator is on, for context. */
  page?: string;
}

export interface AssistantChatOptions {
  /** Reuse a chat session id to continue it. */
  session?: string;
  /** A WebSocket constructor, where there is no global one. */
  WebSocket?: any;
}

/** One question and what came back, in this chat. */
export interface AssistantTurn {
  question: string;
  answer?: AssistantAnswer;
  error?: AssistantError;
  stopped?: boolean;
  at: Date;
}

export interface AssistantEvents {
  delta: (text: string) => void;
  status: (status: string) => void;
  answer: (answer: AssistantAnswer) => void;
  error: (error: AssistantError) => void;
  stopped: () => void;
  confirm: (request: AssistantConfirmRequest) => void;
  close: () => void;
}

import { HTTPException, HTTPService } from "../services/http.service.js";
import type {
  AssistantAnswer,
  AssistantAskOptions,
  AssistantChatOptions,
  AssistantClientTool,
  AssistantConfirmRequest,
  AssistantError,
  AssistantEvents,
  AssistantTurn,
} from "../types/assistant.models.js";

/** The one-line refusals the server gives, for an app to show as they are. */
export const AssistantMessages = {
  notReady: "This app's assistant isn't set up yet. Ask your admin.",
  budget: "The assistant is out of budget for today. Ask your supervisor.",
  sharedLogin: "Sign in with your own account to confirm this.",
} as const;

const KEEPALIVE_MS = 5 * 60 * 1000;

/**
 * The app's own assistant (MACHHUB 2, app agents): a chat with the agent
 * built from this app's machhub.app.json, acting as the signed-in operator.
 * It can do only what both the agent and the operator may do; a change waits
 * for the operator to confirm the server's sentence.
 *
 * Needs a hosted app with a signed-in operator who holds "app assistant".
 */
export class Assistant {
  private httpService: HTTPService;

  constructor(httpService: HTTPService) {
    this.httpService = httpService;
  }

  /** Opens a chat with this app's agent. Nothing connects until the first ask. */
  chat(options: AssistantChatOptions = {}): AssistantChat {
    return new AssistantChat(this.httpService, options);
  }
}

type Listener = (...args: any[]) => void;

interface PendingTurn {
  turn: AssistantTurn;
  resolve: (a: AssistantAnswer) => void;
  reject: (e: Error & { code?: string }) => void;
}

interface PendingDecision {
  resolve: () => void;
  reject: (e: Error) => void;
}

/** One chat. Ask one question at a time. */
export class AssistantChat {
  private httpService: HTTPService;
  private WS: any;
  private session?: string;
  private socket: any = null;
  private opening: Promise<void> | null = null;
  private keepalive: ReturnType<typeof setInterval> | null = null;
  private listeners = new Map<string, Set<Listener>>();
  private tools = new Map<string, AssistantClientTool>();
  private current: PendingTurn | null = null;
  private decisions = new Map<string, PendingDecision>();
  private turns: AssistantTurn[] = [];
  private closed = false;

  constructor(httpService: HTTPService, options: AssistantChatOptions = {}) {
    this.httpService = httpService;
    this.session = options.session;
    this.WS = options.WebSocket ?? (globalThis as any).WebSocket;
  }

  /** Listens for an event; returns a function that stops listening. */
  on<E extends keyof AssistantEvents>(event: E, listener: AssistantEvents[E]): () => void {
    let set = this.listeners.get(event);
    if (!set) this.listeners.set(event, (set = new Set()));
    set.add(listener as Listener);
    return () => set!.delete(listener as Listener);
  }

  /**
   * Runs a client tool the manifest lists, when the model asks for it. What
   * it returns goes back to the model; a throw goes back as an error.
   */
  handle(name: string, tool: AssistantClientTool): void {
    this.tools.set(name, tool);
  }

  /** The chat session id, once the chat has connected. */
  get sessionId(): string | undefined {
    return this.session;
  }

  /** Asks a question; resolves with the answer, rejects with a one-line error. */
  async ask(question: string, options: AssistantAskOptions = {}): Promise<AssistantAnswer> {
    if (this.closed) throw new Error("This chat is closed.");
    if (!question.trim()) throw new Error("Ask a question.");
    if (this.current) throw Object.assign(new Error("Wait for this answer first."), { code: "busy" });
    await this.open();
    const turn: AssistantTurn = { question, at: new Date() };
    this.turns.push(turn);
    return new Promise<AssistantAnswer>((resolve, reject) => {
      this.current = { turn, resolve, reject };
      this.send({ question, sources: options.sources, page: options.page });
    });
  }

  /** Cancels the answer in flight. */
  stop(): void {
    if (this.current) this.send({ type: "cancel" });
  }

  /** The questions and answers of this chat, oldest first. */
  async history(): Promise<AssistantTurn[]> {
    return this.turns.map((t) => ({ ...t }));
  }

  /** Closes the chat. A change waiting for confirmation is dropped. */
  close(): void {
    this.closed = true;
    this.teardown();
  }

  // ── socket ────────────────────────────────────────────────────────────

  private async open(): Promise<void> {
    if (this.socket && this.socket.readyState === 1) return;
    if (this.opening) return this.opening;
    this.opening = this.connect().finally(() => {
      this.opening = null;
    });
    return this.opening;
  }

  private async connect(): Promise<void> {
    if (!this.WS) throw new Error("This environment has no WebSocket.");
    let ticket: { ticket: string; session_id: string };
    try {
      ticket = await this.httpService.request
        .withJSON({})
        .post("assistant/ticket", this.session ? { session: this.session } : undefined);
    } catch (e) {
      throw refusal(e);
    }
    this.session = ticket.session_id;
    const base = String((this.httpService as any).url?.href ?? "").replace(/\/$/, "");
    const url = new URL(base + "/assistant/ws/" + encodeURIComponent(ticket.session_id));
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.searchParams.set("ticket", ticket.ticket);

    await new Promise<void>((resolve, reject) => {
      const ws = new this.WS(url.toString());
      let opened = false;
      ws.onopen = () => {
        opened = true;
        this.socket = ws;
        this.keepalive = setInterval(() => this.send({ type: "ping" }), KEEPALIVE_MS);
        // Never what keeps a Node process alive.
        (this.keepalive as any)?.unref?.();
        resolve();
      };
      ws.onmessage = (ev: any) => this.receive(typeof ev.data === "string" ? ev.data : String(ev.data));
      ws.onerror = () => {
        if (!opened) reject(Object.assign(new Error("The assistant could not be reached."), { code: "socket" }));
      };
      ws.onclose = (ev: any) => {
        if (!opened) {
          const code = ev?.code === 4409 ? "not_ready" : "socket";
          reject(Object.assign(new Error(code === "not_ready" ? AssistantMessages.notReady : "The assistant could not be reached."), { code }));
          return;
        }
        if (this.socket === ws) this.socket = null;
        this.dropped();
      };
    });
  }

  private send(frame: Record<string, unknown>): void {
    if (this.socket && this.socket.readyState === 1) this.socket.send(JSON.stringify(frame));
  }

  private emit(event: string, ...args: unknown[]): void {
    for (const fn of this.listeners.get(event) ?? []) {
      try {
        fn(...args);
      } catch (e) {
        console.error("(Assistant) A listener threw:", e);
      }
    }
  }

  private receive(raw: string): void {
    let m: any;
    try {
      m = JSON.parse(raw);
    } catch {
      return;
    }
    switch (m.type) {
      case "delta":
        this.emit("delta", m.text ?? "");
        break;
      case "status":
        this.emit("status", m.text ?? "");
        break;
      case "answer": {
        const answer: AssistantAnswer = {
          text: m.text ?? "",
          citations: m.citations ?? [],
          traceId: m.trace_id,
          toolCalls: m.tool_calls,
        };
        this.emit("answer", answer);
        this.finish((t) => {
          t.turn.answer = answer;
          t.resolve(answer);
        });
        break;
      }
      case "stopped":
        this.emit("stopped");
        this.finish((t) => {
          t.turn.stopped = true;
          t.reject(Object.assign(new Error("Stopped."), { code: "stopped" }));
        });
        break;
      case "error": {
        const error: AssistantError = { message: m.text ?? "Something went wrong.", code: m.code };
        this.emit("error", error);
        if (error.code === "busy") break; // the question in flight goes on
        this.finish((t) => {
          t.turn.error = error;
          t.reject(Object.assign(new Error(error.message), { code: error.code }));
        });
        break;
      }
      case "confirm_request":
        this.emit("confirm", this.confirmRequest(m));
        break;
      case "confirm_ok":
        this.decided(m.action_id);
        break;
      case "confirm_error":
        this.decided(m.action_id, m.text ?? "That could not be confirmed.");
        break;
      case "client_tool":
        void this.runClientTool(m.call_id, m.name, m.args ?? {});
        break;
    }
  }

  private finish(fn: (t: PendingTurn) => void): void {
    const t = this.current;
    this.current = null;
    if (t) fn(t);
  }

  private confirmRequest(m: any): AssistantConfirmRequest {
    const actionId: string = m.action_id;
    const decide = (type: "confirm" | "decline") =>
      new Promise<void>((resolve, reject) => {
        if (!this.socket) {
          reject(new Error("The chat closed; nothing was changed."));
          return;
        }
        this.decisions.set(actionId, { resolve, reject });
        this.send({ type, action_id: actionId });
      });
    return {
      actionId,
      tool: m.tool ?? "",
      text: m.text ?? "",
      expires: m.expires ? new Date(m.expires) : new Date(Date.now() + 60_000),
      canConfirm: m.can_confirm !== false,
      confirm: () => decide("confirm"),
      decline: () => decide("decline"),
    };
  }

  private decided(actionId: string, failure?: string): void {
    const d = this.decisions.get(actionId);
    if (!d) return;
    this.decisions.delete(actionId);
    failure ? d.reject(Object.assign(new Error(failure), { code: "confirm" })) : d.resolve();
  }

  private async runClientTool(callId: string, name: string, args: Record<string, any>): Promise<void> {
    const tool = this.tools.get(name);
    let result: unknown;
    if (!tool) {
      result = { error: `this app does not handle ${name}` };
    } else {
      try {
        result = (await tool(args)) ?? { ok: true };
      } catch (e: any) {
        result = { error: e?.message ?? String(e) };
      }
    }
    this.send({ type: "client_tool_result", call_id: callId, result });
  }

  private dropped(): void {
    this.stopKeepalive();
    for (const [, d] of this.decisions) d.reject(new Error("The chat closed; nothing was changed."));
    this.decisions.clear();
    this.finish((t) => {
      const error: AssistantError = { message: "The chat closed before the answer came.", code: "socket" };
      t.turn.error = error;
      t.reject(Object.assign(new Error(error.message), { code: error.code }));
    });
    this.emit("close");
  }

  private stopKeepalive(): void {
    if (this.keepalive) clearInterval(this.keepalive);
    this.keepalive = null;
  }

  private teardown(): void {
    const ws = this.socket;
    this.socket = null;
    this.dropped();
    try {
      ws?.close();
    } catch {
      /* already closed */
    }
  }
}

/** A ticket refusal as the one line the server gave. */
function refusal(e: unknown): Error & { code?: string } {
  if (e instanceof HTTPException) {
    try {
      const body = JSON.parse(e.body);
      if (body?.message) return Object.assign(new Error(body.message), { code: body.code });
    } catch {
      /* not JSON */
    }
    if (e.status === 409) return Object.assign(new Error(AssistantMessages.notReady), { code: "not_ready" });
    if (e.status === 401) return Object.assign(new Error("Sign in to use the assistant."), { code: "sign_in" });
  }
  return Object.assign(new Error("The assistant could not be reached."), { code: "socket" });
}

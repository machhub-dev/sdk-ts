import { HTTPException, HTTPService, tokenStorage } from "../services/http.service.js";
import { AppUserAuthErrorCode, AppUserAuthResponse, AppUserSession } from "../types/auth.models.js";
import { RecordID, RecordIDToString } from "../types/recordID.models.js";

/**
 * A failed app-user call. `code` is the server's `error.code` (for example
 * `invalid_credentials`, `conflict`, `locked`) and `status` the HTTP status;
 * both are undefined when the request never got an answer.
 */
export class CollectionAuthError extends Error {
  public operation: string;
  public collectionName: string;
  public code?: AppUserAuthErrorCode;
  public status?: number;
  public originalError: Error;

  constructor(operation: string, collectionName: string, originalError: Error) {
    let code: string | undefined;
    let status: number | undefined;
    let detail = originalError.message;
    if (originalError instanceof HTTPException) {
      status = originalError.status;
      try {
        const parsed = JSON.parse(originalError.body);
        if (typeof parsed?.error?.code === "string") code = parsed.error.code;
        if (typeof parsed?.error?.message === "string") detail = parsed.error.message;
      } catch {
        // Not the JSON error shape (a proxy's page, say): keep the plain message.
      }
    }
    super(`Collection auth '${operation}' failed on '${collectionName}': ${detail}`);
    this.name = "CollectionAuthError";
    this.operation = operation;
    this.collectionName = collectionName;
    this.code = code;
    this.status = status;
    this.originalError = originalError;
  }
}

/**
 * Sign-in for one collection's app users: the records of a collection with
 * sign-in switched on. Reached as `sdk.collection(name).auth`.
 *
 * The app user's token goes in the storage slot `sdk.auth.login` uses, so every
 * later SDK request carries it and one SDK instance holds one signed-in
 * identity. Needs MACHHUB 2.
 */
export class CollectionAuth {
  private httpService: HTTPService;
  private collectionName: string;

  constructor(httpService: HTTPService, collectionName: string) {
    this.httpService = httpService;
    this.collectionName = collectionName;
  }

  private path(route: string): string {
    return `collections/${encodeURIComponent(this.collectionName)}/auth/${route}`;
  }

  private store<T>(res: AppUserAuthResponse<T>): AppUserAuthResponse<T> {
    if (!res || typeof res.token !== "string" || !res.token) {
      throw new Error("the server sent no token");
    }
    const session: AppUserSession<T> = {
      collection: this.collectionName,
      record: res.record,
      expires: res.expires,
    };
    tokenStorage.set(this.httpService.tokenStorageKey, res.token);
    tokenStorage.set(this.httpService.appUserStorageKey, JSON.stringify(session));
    return res;
  }

  private async run<T>(operation: string, call: () => Promise<T>): Promise<T> {
    try {
      return await call();
    } catch (e: unknown) {
      throw new CollectionAuthError(operation, this.collectionName, e as Error);
    }
  }

  /**
   * Creates an app user and signs them in. `fields` are the record's other
   * fields. 403 `sign_up_closed` when the collection does not take sign-ups,
   * 409 `conflict` when the email is taken.
   */
  async signUp<T = Record<string, any>>(email: string, password: string, fields: Record<string, unknown> = {}): Promise<AppUserAuthResponse<T>> {
    return this.run("signUp", async () => this.store(
      await this.httpService.request
        .withJSON({ ...fields, email, password })
        .post<AppUserAuthResponse<T>>(this.path("sign-up"))
    ));
  }

  /** Signs an app user in. 401 `invalid_credentials`, 429 `locked` after too many tries. */
  async signIn<T = Record<string, any>>(email: string, password: string): Promise<AppUserAuthResponse<T>> {
    return this.run("signIn", async () => this.store(
      await this.httpService.request
        .withJSON({ email, password })
        .post<AppUserAuthResponse<T>>(this.path("sign-in"))
    ));
  }

  /** Trades the signed-in app user's token for a fresh one. */
  async refresh<T = Record<string, any>>(): Promise<AppUserAuthResponse<T>> {
    return this.run("refresh", async () => this.store(
      await this.httpService.request.post<AppUserAuthResponse<T>>(this.path("refresh"))
    ));
  }

  /** Signs out here only: drops the stored token and session. The token stays valid elsewhere. */
  async signOut(): Promise<void> {
    tokenStorage.remove(this.httpService.tokenStorageKey);
    tokenStorage.remove(this.httpService.appUserStorageKey);
  }

  /** Ends every session of the signed-in app user, then signs out here. */
  async signOutEverywhere(): Promise<void> {
    await this.run("signOutEverywhere", () =>
      this.httpService.request.post(this.path("sign-out-everywhere"))
    );
    await this.signOut();
  }

  /** Changes the signed-in app user's password and stores the fresh token it answers. */
  async changePassword<T = Record<string, any>>(oldPassword: string, newPassword: string): Promise<AppUserAuthResponse<T>> {
    return this.run("changePassword", async () => this.store(
      await this.httpService.request
        .withJSON({ old_password: oldPassword, new_password: newPassword })
        .post<AppUserAuthResponse<T>>(this.path("change-password"))
    ));
  }

  /**
   * Sets an app user's password. For a manager of the collection (a MACHHUB
   * user or a developer key), not for app users; the stored session is untouched.
   */
  async setPassword(recordId: string | RecordID, password: string): Promise<void> {
    const id = typeof recordId === "string" ? recordId : RecordIDToString(recordId);
    await this.run("setPassword", () =>
      this.httpService.request
        .withJSON({ password })
        .put(this.path(`records/${encodeURIComponent(id)}/password`))
    );
  }

  /**
   * The signed-in app user of this collection, from storage (no request). Null
   * when nobody is signed in, the session has expired, or the signed-in
   * identity belongs elsewhere (a MACHHUB user, or another collection).
   */
  current<T = Record<string, any>>(): AppUserSession<T> | null {
    if (!tokenStorage.get(this.httpService.tokenStorageKey)) return null;
    const raw = tokenStorage.get(this.httpService.appUserStorageKey);
    if (!raw) return null;
    let session: AppUserSession<T>;
    try {
      session = JSON.parse(raw);
    } catch {
      return null;
    }
    if (!session || session.collection !== this.collectionName) return null;
    if (typeof session.expires !== "number" || session.expires * 1000 <= Date.now()) return null;
    return session;
  }
}

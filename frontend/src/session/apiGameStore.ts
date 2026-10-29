// Shared games on the backend: the HTTP API for actions, a WebSocket for live updates.
// The request and response shapes are the backend's API contract (backend/src/api-types.ts).

import type {
  AnswerClaimRequest,
  AnswerSeatRequest,
  CallDto,
  CallRequest,
  ClaimDto,
  ClaimRequest,
  CreateEventRequest,
  EventSnapshot,
  JoinedResponse,
  JoinRequest,
  LiveTicketResponse,
  PartnershipsRequest,
  PlayCardRequest,
  PlayDto,
  ResultDto,
  SaveResultRequest,
  SeatRequestCreated,
  SeatRequestRequest,
  SeatRequestState,
  SeatRequestStatus,
} from "../../../backend/src/api-types";
import type { GameFileV1 } from "../providers/gameFile";
import type { GameStore, LiveMessage, ProfileStore } from "./store";

/** A request the backend turned down, with its own plain-English reason. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Join codes are shown as "K7PM-3QXT" but sent without the dash, in capitals. */
export function normaliseCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

const PING_MS = 25_000;
/** Waits before reconnecting after a dropped link, growing with each failure. */
const RETRY_MS = [1_000, 2_000, 5_000, 10_000];

export class ApiGameStore implements GameStore {
  constructor(
    private readonly profile: ProfileStore,
    private readonly base = "/api",
  ) {}

  /** A call as this device's player in game `code` (if it is one). */
  private request<T>(method: string, path: string, code?: string, body?: unknown): Promise<T> {
    return this.send<T>(method, path, code ? this.profile.playerId(code) : null, body);
  }

  /** A call with the given key in X-Player-Id (or none). */
  private async send<T>(method: string, path: string, key: string | null, body?: unknown): Promise<T> {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (key) headers["X-Player-Id"] = key;

    let res: Response;
    try {
      res = await fetch(this.base + path, {
        method,
        headers,
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
    } catch {
      throw new ApiError(0, "Can't reach the server. Check your connection and try again.");
    }
    if (res.status === 204) return undefined as T;
    const data = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
    if (!res.ok) throw new ApiError(res.status, data?.error ?? `The server said ${res.status}`);
    return data as T;
  }

  private remember(joined: JoinedResponse): string {
    this.profile.setPlayerId(joined.code, joined.playerId);
    this.profile.setCurrentGame(joined.code);
    return joined.code;
  }

  async create(name: string, game: GameFileV1, startBoard: number): Promise<string> {
    const req: CreateEventRequest = { name, game, startBoard };
    return this.remember(await this.request<JoinedResponse>("POST", "/events", undefined, req));
  }

  async createDemo(name: string): Promise<string> {
    const req: JoinRequest = { name };
    return this.remember(await this.request<JoinedResponse>("POST", "/events/demo", undefined, req));
  }

  async join(code: string, name: string): Promise<string> {
    const c = normaliseCode(code);
    if (this.profile.playerId(c)) {
      // Already in it from this device (e.g. opened the shared link again): just go back in.
      const snap = await this.snapshot(c);
      if (snap.you) {
        this.profile.setCurrentGame(c);
        return c;
      }
    }
    return this.remember(await this.request<JoinedResponse>("POST", `/events/${c}/players`, undefined, { name }));
  }

  snapshot(code: string): Promise<EventSnapshot> {
    return this.request<EventSnapshot>("GET", `/events/${code}`, code);
  }

  async leave(code: string): Promise<void> {
    await this.request<void>("DELETE", `/events/${code}/players/me`, code);
    this.profile.forget(code);
  }

  async choosePartnerships(code: string, choice: PartnershipsRequest): Promise<void> {
    await this.request<unknown>("POST", `/events/${code}/partnerships`, code, choice);
  }

  saveResult(code: string, board: number, result: SaveResultRequest): Promise<ResultDto> {
    return this.request<ResultDto>("PUT", `/events/${code}/boards/${board}`, code, result);
  }

  startCardPlay(code: string, board: number): Promise<ResultDto> {
    return this.request<ResultDto>("POST", `/events/${code}/boards/${board}/play`, code, {});
  }

  call(code: string, board: number, seq: number, call: string): Promise<CallDto> {
    const body: CallRequest = { seq, call };
    return this.request<CallDto>("POST", `/events/${code}/boards/${board}/calls`, code, body);
  }

  playCard(code: string, board: number, seq: number, card: string): Promise<PlayDto> {
    const body: PlayCardRequest = { seq, card };
    return this.request<PlayDto>("POST", `/events/${code}/boards/${board}/cards`, code, body);
  }

  claim(code: string, board: number, tricks: number): Promise<ClaimDto> {
    const body: ClaimRequest = { tricks };
    return this.request<ClaimDto>("POST", `/events/${code}/boards/${board}/claim`, code, body);
  }

  answerClaim(code: string, board: number, accept: boolean): Promise<ClaimDto | null> {
    const body: AnswerClaimRequest = { accept };
    return this.request<ClaimDto | null>("POST", `/events/${code}/boards/${board}/claim/answer`, code, body);
  }

  async withdrawClaim(code: string, board: number): Promise<void> {
    await this.request<void>("DELETE", `/events/${code}/boards/${board}/claim`, code);
  }

  /**
   * The key each pending seat request was given, by request ID. Kept in memory only: it's not this
   * device's key to the game until the request is allowed.
   */
  private readonly requestKeys = new Map<string, string>();

  async requestSeat(code: string, name: string, slot: number) {
    const c = normaliseCode(code);
    const body: SeatRequestRequest = { name, slot };
    const created = await this.request<SeatRequestCreated>("POST", `/events/${c}/requests`, undefined, body);
    this.requestKeys.set(created.requestId, created.playerId);
    return { requestId: created.requestId, anyoneConnected: created.anyoneConnected };
  }

  async seatRequestStatus(code: string, requestId: string): Promise<SeatRequestStatus> {
    const c = normaliseCode(code);
    const key = this.requestKeys.get(requestId);
    if (!key) return "cancelled";
    const { status } = await this.send<SeatRequestState>("GET", `/events/${c}/requests/${requestId}`, key);
    if (status !== "pending") this.requestKeys.delete(requestId);
    if (status === "allowed") this.remember({ code: c, playerId: key, slot: 0 });
    return status;
  }

  async cancelSeatRequest(code: string, requestId: string): Promise<void> {
    const key = this.requestKeys.get(requestId);
    if (!key) return;
    this.requestKeys.delete(requestId);
    await this.send<void>("DELETE", `/events/${normaliseCode(code)}/requests/${requestId}`, key);
  }

  async answerSeatRequest(code: string, requestId: string, allow: boolean): Promise<void> {
    const body: AnswerSeatRequest = { allow };
    await this.request<void>("POST", `/events/${code}/requests/${requestId}/answer`, code, body);
  }

  async fillWithTestPlayers(code: string): Promise<void> {
    await this.request<unknown>("POST", `/events/${code}/test-players`, code, {});
  }

  subscribe(code: string, onMessage: (message: LiveMessage) => void): () => void {
    if (!this.profile.playerId(code)) return () => {};

    let socket: WebSocket | null = null;
    let connecting = false;
    let ping: ReturnType<typeof setInterval> | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let failures = 0;
    let opened = false;
    /** Whether we last told the screen we're connected (null: not said yet). */
    let online: boolean | null = null;
    let stopped = false;

    // A dropped link, or one that couldn't be opened: say so once per outage, then try again later.
    const lost = () => {
      if (stopped) return;
      if (online !== false) onMessage({ type: "disconnected" });
      online = false;
      retry = setTimeout(() => void connect(), RETRY_MS[Math.min(failures++, RETRY_MS.length - 1)]);
    };

    const connect = async () => {
      clearTimeout(retry);
      if (stopped || connecting || (socket && socket.readyState <= WebSocket.OPEN)) return;
      // Swap this device's key for a single-use pass: the key itself never goes in an address.
      connecting = true;
      let ticket: string;
      try {
        ({ ticket } = await this.request<LiveTicketResponse>("POST", `/events/${code}/live-ticket`, code));
      } catch (e) {
        connecting = false;
        console.info(`Live connection couldn't open: ${(e as Error).message}, tab ${document.visibilityState}`);
        lost();
        return;
      }
      connecting = false;
      if (stopped) return;
      const proto = location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(`${proto}//${location.host}${this.base}/events/${code}/live?ticket=${ticket}`);
      socket = ws;
      ws.onopen = () => {
        failures = 0;
        // Anything pushed while we were away was missed: tell the screen to catch up.
        if (opened) onMessage({ type: "reconnected" });
        opened = true;
        online = true;
        ping = setInterval(() => ws.readyState === WebSocket.OPEN && ws.send("ping"), PING_MS);
      };
      ws.onmessage = (e) => {
        if (e.data === "pong") return;
        try {
          onMessage(JSON.parse(String(e.data)) as LiveMessage);
        } catch {
          // Not a message we understand; ignore it.
        }
      };
      ws.onclose = (e) => {
        clearInterval(ping);
        // Why the link dropped, for working out where drops come from (open the browser console):
        // 1006 with the tab hidden is usually the browser putting a background tab to sleep.
        if (!stopped) {
          console.info(
            `Live connection closed: code ${e.code}${e.reason ? ` (${e.reason})` : ""}, tab ${document.visibilityState}`,
          );
        }
        lost();
      };
    };

    // Phones and laptops drop sockets while asleep; reconnect as soon as the page is looked at again.
    const onVisible = () => {
      if (document.visibilityState === "visible") void connect();
    };
    document.addEventListener("visibilitychange", onVisible);
    void connect();

    return () => {
      stopped = true;
      clearTimeout(retry);
      clearInterval(ping);
      document.removeEventListener("visibilitychange", onVisible);
      socket?.close(1000, "Done");
    };
  }
}

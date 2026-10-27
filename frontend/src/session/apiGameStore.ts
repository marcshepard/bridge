// Shared games on the backend: the HTTP API for actions, a WebSocket for live updates.
// The request and response shapes are the backend's API contract (backend/src/api-types.ts).

import type {
  CreateEventRequest,
  EventSnapshot,
  JoinedResponse,
  PartnershipsRequest,
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

  private async request<T>(method: string, path: string, code?: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const id = code ? this.profile.playerId(code) : null;
    if (id) headers["X-Player-Id"] = id;

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

  async fillWithTestPlayers(code: string): Promise<void> {
    await this.request<unknown>("POST", `/events/${code}/test-players`, code, {});
  }

  subscribe(code: string, onMessage: (message: LiveMessage) => void): () => void {
    const playerId = this.profile.playerId(code);
    if (!playerId) return () => {};

    let socket: WebSocket | null = null;
    let ping: ReturnType<typeof setInterval> | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let failures = 0;
    let opened = false;
    let stopped = false;

    const url = () => {
      const proto = location.protocol === "https:" ? "wss:" : "ws:";
      return `${proto}//${location.host}${this.base}/events/${code}/live?playerId=${encodeURIComponent(playerId)}`;
    };

    const connect = () => {
      clearTimeout(retry);
      if (stopped || (socket && socket.readyState <= WebSocket.OPEN)) return;
      const ws = new WebSocket(url());
      socket = ws;
      ws.onopen = () => {
        failures = 0;
        // Anything pushed while we were away was missed: tell the screen to catch up.
        if (opened) onMessage({ type: "reconnected" });
        opened = true;
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
      ws.onclose = () => {
        clearInterval(ping);
        if (stopped) return;
        retry = setTimeout(connect, RETRY_MS[Math.min(failures++, RETRY_MS.length - 1)]);
      };
    };

    // Phones and laptops drop sockets while asleep; reconnect as soon as the page is looked at again.
    const onVisible = () => {
      if (document.visibilityState === "visible") connect();
    };
    document.addEventListener("visibilitychange", onVisible);
    connect();

    return () => {
      stopped = true;
      clearTimeout(retry);
      clearInterval(ping);
      document.removeEventListener("visibilitychange", onVisible);
      socket?.close(1000, "Done");
    };
  }
}

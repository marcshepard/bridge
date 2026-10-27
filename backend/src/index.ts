// Bridge Replay API. All routes are under /api; see docs/DESIGN.md ("Backend") for the design.
//
// Identity: no accounts. Creating or joining a game returns a secret `playerId`, which the phone
// keeps and sends back in the X-Player-Id header. Other players only ever see a public `slot` (1–4).

import { Hono, type Context } from "hono";
import { tableResult } from "../../frontend/src/core/contract";
import { parseGameFile, type GameFileV1 } from "../../frontend/src/providers/gameFile";
import type {
  CreateEventRequest,
  EventSnapshot,
  JoinedResponse,
  JoinRequest,
  PartnershipsRequest,
  PushMessage,
  ResultDto,
  ResultsSinceResponse,
  SaveResultRequest,
} from "./api-types";
import * as db from "./db";
import type { Env } from "./env";
import { newJoinCode, newPlayerId, normaliseJoinCode } from "./ids";
import { assignSeats } from "./seats";

export { EventHub } from "./hub";

const MAX_PLAYERS = 4;
const EVENT_LIFETIME_DAYS = 30;
const MAX_NAME_LENGTH = 30;
const MAX_GAME_BYTES = 512 * 1024;

type Ctx = Context<{ Bindings: Env }>;

class HttpError extends Error {
  constructor(
    readonly status: 400 | 403 | 404 | 409 | 413,
    message: string,
  ) {
    super(message);
  }
}

const app = new Hono<{ Bindings: Env }>().basePath("/api");

app.onError((err, c) => {
  if (err instanceof HttpError) return c.json({ error: err.message }, err.status);
  console.error(err);
  return c.json({ error: "Something went wrong on the server" }, 500);
});

// ---- Helpers ------------------------------------------------------------------------------------

const nowIso = () => new Date().toISOString();

function cleanName(raw: unknown): string {
  const name = typeof raw === "string" ? raw.trim().replace(/\s+/g, " ") : "";
  if (!name) throw new HttpError(400, "Please enter a display name");
  if (name.length > MAX_NAME_LENGTH) throw new HttpError(400, `Names can be at most ${MAX_NAME_LENGTH} characters`);
  return name;
}

async function body<T>(c: Ctx): Promise<T> {
  try {
    return (await c.req.json()) as T;
  } catch {
    throw new HttpError(400, "Expected a JSON body");
  }
}

async function loadEvent(c: Ctx): Promise<db.EventRow> {
  const code = normaliseJoinCode(c.req.param("code") ?? "");
  const event = code ? await db.getEvent(c.env.DB, code, nowIso()) : null;
  if (!event) throw new HttpError(404, "No game with that code");
  return event;
}

/** The calling player (from X-Player-Id), or a 403. */
function caller(c: Ctx, players: db.PlayerRow[]): db.PlayerRow {
  const id = c.req.header("X-Player-Id");
  const me = id ? players.find((p) => p.player_id === id) : undefined;
  if (!me) throw new HttpError(403, "You're not a player in this game");
  return me;
}

function hub(env: Env, code: string) {
  return env.HUB.get(env.HUB.idFromName(code));
}

async function push(c: Ctx, code: string, message: PushMessage) {
  // Don't make the caller wait for the broadcast, and don't fail their request if it hiccups.
  c.executionCtx.waitUntil(hub(c.env, code).notify(message).catch((e) => console.error("push failed", e)));
}

function nextFreeSlot(players: db.PlayerRow[]): number | null {
  for (let s = 1; s <= MAX_PLAYERS; s++) if (!players.some((p) => p.slot === s)) return s;
  return null;
}

// ---- Routes -------------------------------------------------------------------------------------

/** Create a game from a game file; the creator joins as slot 1. */
app.post("/events", async (c) => {
  if (Number(c.req.header("Content-Length") ?? 0) > MAX_GAME_BYTES) throw new HttpError(413, "Game file too large");
  const req = await body<CreateEventRequest>(c);
  const name = cleanName(req.name);

  let game;
  try {
    game = parseGameFile(req.game);
  } catch (e) {
    throw new HttpError(400, `That game file can't be used: ${(e as Error).message}`);
  }
  const startBoard = Number(req.startBoard ?? game.boards[0]!.number);
  if (!game.boards.some((b) => b.number === startBoard)) throw new HttpError(400, `Board ${startBoard} isn't in this game`);

  const now = new Date();
  const expires = new Date(now.getTime() + EVENT_LIFETIME_DAYS * 86_400_000);
  const playerId = newPlayerId();
  const creator: db.PlayerRow = { player_id: playerId, slot: 1, name, is_creator: 1, seat: null };

  // Codes are random; retry on the (astronomically unlikely) collision.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = newJoinCode();
    try {
      await db.insertEvent(
        c.env.DB,
        {
          code,
          title: game.summary.title,
          game_json: JSON.stringify(req.game),
          start_board: startBoard,
          status: "lobby",
          created_at: now.toISOString(),
          expires_at: expires.toISOString(),
        },
        creator,
        now.toISOString(),
      );
      return c.json<JoinedResponse>({ code, playerId, slot: 1 }, 201);
    } catch (e) {
      if (!String(e).includes("UNIQUE")) throw e;
    }
  }
  throw new Error("Couldn't allocate a join code");
});

/** Everything about a game. Anyone with the code can see it (it's how the lobby works). */
app.get("/events/:code", async (c) => {
  const event = await loadEvent(c);
  const now = nowIso(); // taken before reading, so `since=now` can't miss a concurrent save
  const [players, results, connected] = await Promise.all([
    db.getPlayers(c.env.DB, event.code),
    db.getResults(c.env.DB, event.code),
    hub(c.env, event.code).connectedSlots(),
  ]);
  const id = c.req.header("X-Player-Id");
  const me = id ? players.find((p) => p.player_id === id) : undefined;
  const snapshot: EventSnapshot = {
    code: event.code,
    title: event.title,
    status: event.status,
    startBoard: event.start_board,
    game: JSON.parse(event.game_json) as GameFileV1,
    players: players.map((p) => ({
      slot: p.slot,
      name: p.name,
      isCreator: p.is_creator === 1,
      seat: p.seat,
      connected: connected.includes(p.slot),
    })),
    results,
    you: me ? { slot: me.slot, isCreator: me.is_creator === 1, seat: me.seat } : null,
    now,
  };
  return c.json(snapshot);
});

/** Join a game that hasn't started yet. */
app.post("/events/:code/players", async (c) => {
  const event = await loadEvent(c);
  const name = cleanName((await body<JoinRequest>(c)).name);
  if (event.status !== "lobby") throw new HttpError(409, "This game has already started");
  const players = await db.getPlayers(c.env.DB, event.code);
  const slot = nextFreeSlot(players);
  if (slot === null) throw new HttpError(409, "This game already has 4 players");

  const playerId = newPlayerId();
  try {
    await db.insertPlayer(c.env.DB, event.code, { player_id: playerId, slot, name, is_creator: 0, seat: null }, nowIso());
  } catch (e) {
    if (String(e).includes("UNIQUE")) throw new HttpError(409, "Someone else just took that place; try again");
    throw e;
  }
  await push(c, event.code, { type: "players" });
  return c.json<JoinedResponse>({ code: event.code, playerId, slot }, 201);
});

/**
 * Leave the game. Before play starts this frees the place; if the creator leaves the lobby, the
 * game is cancelled (nobody else can set partnerships). Leaving during play is handled in stage 5
 * (seats stay reserved so the player can come back).
 */
app.delete("/events/:code/players/me", async (c) => {
  const event = await loadEvent(c);
  const me = caller(c, await db.getPlayers(c.env.DB, event.code));
  if (event.status !== "lobby") throw new HttpError(409, "Leaving a game in progress isn't supported yet");
  if (me.is_creator) {
    await db.deleteEvent(c.env.DB, event.code);
    await push(c, event.code, { type: "deleted" });
  } else {
    await db.deletePlayer(c.env.DB, event.code, me.player_id);
    await push(c, event.code, { type: "players" });
  }
  return c.body(null, 204);
});

/** The creator chooses partnerships; seats are assigned and play starts. */
app.post("/events/:code/partnerships", async (c) => {
  const event = await loadEvent(c);
  const players = await db.getPlayers(c.env.DB, event.code);
  const me = caller(c, players);
  if (!me.is_creator) throw new HttpError(403, "Only the player who started the game chooses partnerships");
  if (event.status !== "lobby") throw new HttpError(409, "Play has already started");
  if (players.length !== MAX_PLAYERS) throw new HttpError(409, "Waiting for 4 players");

  const req = await body<PartnershipsRequest>(c);
  const partner = "random" in req && req.random ? "random" : Number((req as { partnerSlot: number }).partnerSlot);
  let seats;
  try {
    seats = assignSeats(
      players.map((p) => p.slot),
      me.slot,
      partner,
    );
  } catch (e) {
    throw new HttpError(400, (e as Error).message);
  }
  await db.setSeatsAndStart(c.env.DB, event.code, seats);
  await push(c, event.code, { type: "players" });
  await push(c, event.code, { type: "status", status: "playing" });
  return c.json({ seats: Object.fromEntries(seats) });
});

/** Save or correct a board's result. Any seated player can. */
app.put("/events/:code/boards/:board", async (c) => {
  const event = await loadEvent(c);
  const me = caller(c, await db.getPlayers(c.env.DB, event.code));
  if (event.status !== "playing") throw new HttpError(409, "Results can only be entered while the game is in play");

  const board = Number(c.req.param("board"));
  const game = JSON.parse(event.game_json) as GameFileV1;
  if (!game.boards.some((b) => b.number === board)) throw new HttpError(404, `Board ${board} isn't in this game`);

  const req = await body<SaveResultRequest>(c);
  let parsed;
  try {
    parsed = tableResult(String(req.contract ?? ""), req.declarer ?? null, req.tricks ?? null);
  } catch (e) {
    throw new HttpError(400, (e as Error).message);
  }
  const result: ResultDto = {
    board,
    contract: parsed.contract ? String(req.contract).toUpperCase().replace(/\s+/g, "") : "PASS",
    declarer: parsed.declarer,
    tricks: parsed.tricks,
    enteredBy: me.slot,
    updatedAt: nowIso(),
  };
  await db.upsertResult(c.env.DB, event.code, result);
  await push(c, event.code, { type: "result", result });
  return c.json(result);
});

/** Results changed since a timestamp: how a phone catches up after reconnecting. */
app.get("/events/:code/results", async (c) => {
  const event = await loadEvent(c);
  caller(c, await db.getPlayers(c.env.DB, event.code));
  const since = c.req.query("since") || undefined;
  const now = nowIso(); // before reading, as above
  return c.json<ResultsSinceResponse>({ results: await db.getResults(c.env.DB, event.code, since), now });
});

/** End the game. Any seated player can (the app asks them to confirm). */
app.post("/events/:code/end", async (c) => {
  const event = await loadEvent(c);
  caller(c, await db.getPlayers(c.env.DB, event.code));
  if (event.status === "ended") return c.body(null, 204);
  await db.setStatus(c.env.DB, event.code, "ended");
  await push(c, event.code, { type: "status", status: "ended" });
  return c.body(null, 204);
});

/** Delete the game and its results. Creator only. */
app.delete("/events/:code", async (c) => {
  const event = await loadEvent(c);
  const me = caller(c, await db.getPlayers(c.env.DB, event.code));
  if (!me.is_creator) throw new HttpError(403, "Only the player who started the game can delete it");
  await db.deleteEvent(c.env.DB, event.code);
  await push(c, event.code, { type: "deleted" });
  return c.body(null, 204);
});

/**
 * Live updates. Browsers can't set headers on a WebSocket, so the player ID comes as a query
 * parameter; it's checked here before the connection is handed to the game's EventHub.
 */
app.get("/events/:code/live", async (c) => {
  if (c.req.header("Upgrade") !== "websocket") throw new HttpError(400, "Expected a WebSocket upgrade");
  const event = await loadEvent(c);
  const id = c.req.query("playerId");
  const me = (await db.getPlayers(c.env.DB, event.code)).find((p) => p.player_id === id);
  if (!me) throw new HttpError(403, "You're not a player in this game");
  const headers = new Headers(c.req.raw.headers);
  headers.set("X-Slot", String(me.slot));
  return hub(c.env, event.code).fetch(new Request(c.req.raw, { headers }));
});

/** Dev only: fill the empty places with test players so a game can start from one device. */
app.post("/events/:code/test-players", async (c) => {
  if (c.env.ALLOW_TEST_PLAYERS !== "true") throw new HttpError(404, "Not found");
  const event = await loadEvent(c);
  if (event.status !== "lobby") throw new HttpError(409, "This game has already started");
  const players = await db.getPlayers(c.env.DB, event.code);
  const added: number[] = [];
  for (let slot = nextFreeSlot(players); slot !== null; slot = nextFreeSlot(players)) {
    const row = { player_id: newPlayerId(), slot, name: `Test player ${slot}`, is_creator: 0, seat: null };
    await db.insertPlayer(c.env.DB, event.code, row, nowIso());
    players.push(row);
    added.push(slot);
  }
  if (added.length) await push(c, event.code, { type: "players" });
  return c.json({ added });
});

app.all("*", (c) => c.json({ error: "Not found" }, 404));

export default app;

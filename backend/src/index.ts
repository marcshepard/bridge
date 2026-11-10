// Bridge Replay API. All routes are under /api; see docs/DESIGN.md ("Backend") for the design.
//
// Identity: no accounts. Creating or joining a game returns a secret `playerId`, which the phone
// keeps and sends back in the X-Player-Id header. Other players only ever see a public `slot` (1–4).

import { Hono, type Context } from "hono";
import { auctionResult, callCode, canCall, parseCall, toCall } from "../../frontend/src/core/auction";
import { doubleDummyResult } from "../../frontend/src/core/bidding/result";
import { parseSystemSettings } from "../../frontend/src/core/bidding/system";
import { contractCode, tableResult } from "../../frontend/src/core/contract";
import {
  cardCode,
  claimAccepted,
  claimAnswerers,
  dummyOf,
  finalTricks,
  isComplete,
  parseCard,
  playCard,
  replay,
  toPlay,
  tricksLeft,
} from "../../frontend/src/core/play";
import { parseGameFile, type GameFileV1 } from "../../frontend/src/providers/gameFile";
import type {
  AnswerClaimRequest,
  CallDto,
  CallRequest,
  AnswerSeatRequest,
  ClaimDto,
  ClaimRequest,
  CreateEventRequest,
  CurrentBoardRequest,
  DemoRequest,
  EventSnapshot,
  GameMode,
  JoinedResponse,
  JoinRequest,
  LiveTicketResponse,
  PartnershipsRequest,
  PracticeRequest,
  PlayCardRequest,
  PlayDto,
  PushMessage,
  ResultDto,
  ResultsSinceResponse,
  SaveResultRequest,
  SeatRequestCreated,
  SeatRequestRequest,
  SeatRequestState,
} from "./api-types";
import * as db from "./db";
import type { Env } from "./env";
import type { Seat } from "../../frontend/src/core/types";
import { newJoinCode, newPlayerId, normaliseJoinCode } from "./ids";
import demoGame from "./demo/demo-game.json";
import { assignSeats } from "./seats";

export { EventHub } from "./hub";

const MAX_PLAYERS = 4;
const EVENT_LIFETIME_DAYS = 30;
const MAX_NAME_LENGTH = 30;
const MAX_GAME_BYTES = 512 * 1024;
/** Demo games start part-way through, to show that a game needn't start at board 1. */
const DEMO_START_BOARD = 9;
/** A seat request nobody answers lapses after this long. */
const REQUEST_LIFETIME_MINUTES = 10;
/** At most this many seat requests can wait at once in a game, so nobody can flood the table. */
const MAX_PENDING_REQUESTS = 5;

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
/** Seat requests made before this time have lapsed. */
const requestCutoff = () => new Date(Date.now() - REQUEST_LIFETIME_MINUTES * 60_000).toISOString();

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

/**
 * A player's bidding system as stored: checked with the same rules the devices use (anything the
 * rules don't allow is dropped), or null when none was sent (SAYC as it comes).
 */
const systemJson = (raw: unknown): string | null => (raw === undefined || raw === null ? null : JSON.stringify(parseSystemSettings(raw)));

/** The game's owner only, or a 403 saying `what` is theirs to do. */
function ownerOnly(me: db.PlayerRow, what: string) {
  if (!me.is_creator) throw new HttpError(403, `Only the game's owner can ${what}`);
}

function parseMode(raw: unknown): GameMode {
  if (raw === "cards" || raw === "devices") return raw;
  throw new HttpError(400, "Choose how the boards are played: real cards or on the devices");
}

/** Boards start themselves on the devices: played online, or bidding practice. */
const onDevicesMode = (mode: GameMode) => mode === "devices" || mode === "bidding";

/** The board the table is on (original numbering). */
const currentBoard = (event: db.EventRow) => event.current_board ?? event.start_board;

/**
 * In a game played on the devices, a board starts with its auction as soon as the table is on it,
 * unless it already has a result or is under way. One board at a time: false (and nothing started)
 * when another board's cards are still being played.
 */
async function startOnDevices(c: Ctx, code: string, board: number, by: number): Promise<boolean> {
  const results = await db.getResults(c.env.DB, code);
  if (results.some((r) => r.onDevices && r.tricks === null && r.board !== board)) return false;
  if (!results.some((r) => r.board === board)) {
    await db.startAuction(c.env.DB, code, board, by, nowIso());
    await push(c, code, { type: "result", result: (await db.getResult(c.env.DB, code, board))! });
  }
  return true;
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
  return c.json<JoinedResponse>(await createEvent(c, cleanName(req.name), req.game, req.startBoard, parseMode(req.mode), systemJson(req.system)), 201);
});

/**
 * A demo game, for trying the app alone: the built-in synthetic game (made-up results), starting at
 * board 9 to show a game needn't start at 1, with the other three places filled by bots. You land
 * in the lobby to pick partners. Bots are allowed here in the live app because the game is ours.
 */
app.post("/events/demo", async (c) => {
  const req = await body<DemoRequest>(c);
  const joined = await createEvent(c, cleanName(req.name), demoGame as unknown as GameFileV1, DEMO_START_BOARD, parseMode(req.mode), systemJson(req.system));
  await addBots(c, joined.code);
  return c.json<JoinedResponse>(joined, 201);
});

/**
 * Practice with bots: you as South, bots in the other three seats, on your game file or the built-in
 * demo game. No lobby: seats are set and the first board's auction starts straight away. Bidding
 * only (each contract scored double dummy), or, with `play`, bid and played on the devices. Bots
 * are allowed in the live app here, as in the demo: it's a game for one person.
 */
app.post("/events/practice", async (c) => {
  if (Number(c.req.header("Content-Length") ?? 0) > MAX_GAME_BYTES) throw new HttpError(413, "Game file too large");
  const req = await body<PracticeRequest>(c);
  const file = req.game ?? (demoGame as unknown as GameFileV1);
  // From the first board unless asked otherwise (not the demo's board 9: practice is for working through a game).
  const joined = await createEvent(c, cleanName(req.name), file, req.startBoard, req.play ? "devices" : "bidding", systemJson(req.system));
  await addBots(c, joined.code);
  // You're South; your partner North and the opponents are bots (slots 2–4 in join order).
  await db.setSeatsAndStart(c.env.DB, joined.code, new Map<number, Seat>([[1, "S"], [2, "W"], [3, "N"], [4, "E"]]));
  const event = (await db.getEvent(c.env.DB, joined.code, nowIso()))!;
  await startOnDevices(c, event.code, currentBoard(event), joined.slot);
  return c.json<JoinedResponse>(joined, 201);
});

/** Validates the game file, then creates the game with you as its first player. */
async function createEvent(
  c: Ctx,
  name: string,
  file: GameFileV1,
  start: number | undefined,
  mode: GameMode,
  system: string | null,
): Promise<JoinedResponse> {
  let game;
  try {
    game = parseGameFile(file);
  } catch (e) {
    throw new HttpError(400, `That game file can't be used: ${(e as Error).message}`);
  }
  const startBoard = Number(start ?? game.boards[0]!.number);
  if (!game.boards.some((b) => b.number === startBoard)) throw new HttpError(400, `Board ${startBoard} isn't in this game`);

  const now = new Date();
  const expires = new Date(now.getTime() + EVENT_LIFETIME_DAYS * 86_400_000);
  const playerId = newPlayerId();
  const creator: db.PlayerRow = { player_id: playerId, slot: 1, name, is_creator: 1, is_bot: 0, no_app: 0, seat: null, system_json: system };

  // Codes are random; retry on the (astronomically unlikely) collision.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = newJoinCode();
    try {
      await db.insertEvent(
        c.env.DB,
        {
          code,
          title: game.summary.title,
          game_json: JSON.stringify(file),
          start_board: startBoard,
          status: "lobby",
          mode,
          current_board: null,
          created_at: now.toISOString(),
          expires_at: expires.toISOString(),
        },
        creator,
        now.toISOString(),
      );
      return { code, playerId, slot: 1 };
    } catch (e) {
      if (!String(e).includes("UNIQUE")) throw e;
    }
  }
  throw new Error("Couldn't allocate a join code");
}

/** Everything about a game. Anyone with the code can see it (it's how the lobby works). */
app.get("/events/:code", async (c) => {
  const event = await loadEvent(c);
  const now = nowIso(); // taken before reading, so `since=now` can't miss a concurrent save
  const [players, results, calls, plays, claims, connected, requests] = await Promise.all([
    db.getPlayers(c.env.DB, event.code),
    db.getResults(c.env.DB, event.code),
    db.getAllCalls(c.env.DB, event.code),
    db.getAllPlays(c.env.DB, event.code),
    db.getLiveClaims(c.env.DB, event.code),
    hub(c.env, event.code).connectedSlots(),
    db.getPendingSeatRequests(c.env.DB, event.code, requestCutoff()),
  ]);
  const id = c.req.header("X-Player-Id");
  const me = id ? players.find((p) => p.player_id === id) : undefined;
  const snapshot: EventSnapshot = {
    code: event.code,
    title: event.title,
    status: event.status,
    mode: event.mode,
    startBoard: event.start_board,
    currentBoard: currentBoard(event),
    game: JSON.parse(event.game_json) as GameFileV1,
    players: players.map((p) => ({
      slot: p.slot,
      name: p.name,
      isCreator: p.is_creator === 1,
      noApp: p.no_app === 1,
      isBot: p.is_bot === 1,
      seat: p.seat,
      system: p.system_json ? parseSystemSettings(JSON.parse(p.system_json)) : null,
      connected: connected.includes(p.slot),
    })),
    results,
    calls,
    plays,
    claims,
    requests: me ? requests.map(db.toSeatRequest) : [],
    you: me ? { slot: me.slot, isCreator: me.is_creator === 1, seat: me.seat } : null,
    now,
  };
  return c.json(snapshot);
});

/** Join a game that hasn't started yet. */
app.post("/events/:code/players", async (c) => {
  const event = await loadEvent(c);
  const req = await body<JoinRequest>(c);
  const name = cleanName(req.name);
  if (event.status !== "lobby") throw new HttpError(409, "This game has already started");
  const players = await db.getPlayers(c.env.DB, event.code);
  const slot = nextFreeSlot(players);
  if (slot === null) throw new HttpError(409, "This game already has 4 players");

  const playerId = newPlayerId();
  try {
    await db.insertPlayer(c.env.DB, event.code, { player_id: playerId, slot, name, is_creator: 0, is_bot: 0, no_app: 0, seat: null, system_json: systemJson(req.system) }, nowIso());
  } catch (e) {
    if (String(e).includes("UNIQUE")) throw new HttpError(409, "Someone else just took that place; try again");
    throw e;
  }
  await push(c, event.code, { type: "players" });
  return c.json<JoinedResponse>({ code: event.code, playerId, slot }, 201);
});

/**
 * The owner adds a player without the app to a real-cards game in the lobby: a name in a seat, for
 * someone at the table who gets their hands some other way (a printed hand record). Nobody gets
 * their key; someone can take the seat over later with a seat request.
 */
app.post("/events/:code/players/no-app", async (c) => {
  const event = await loadEvent(c);
  const players = await db.getPlayers(c.env.DB, event.code);
  ownerOnly(caller(c, players), "add a player without the app");
  if (event.mode !== "cards") throw new HttpError(409, "Players without the app can only join games played with real cards");
  if (event.status !== "lobby") throw new HttpError(409, "This game has already started");
  const name = cleanName((await body<JoinRequest>(c)).name);
  const slot = nextFreeSlot(players);
  if (slot === null) throw new HttpError(409, "This game already has 4 players");
  const row = { player_id: newPlayerId(), slot, name, is_creator: 0, is_bot: 0, no_app: 1, seat: null, system_json: null };
  try {
    await db.insertPlayer(c.env.DB, event.code, row, nowIso());
  } catch (e) {
    if (String(e).includes("UNIQUE")) throw new HttpError(409, "Someone else just took that place; try again");
    throw e;
  }
  await push(c, event.code, { type: "players" });
  return c.json({ slot }, 201);
});

/** The owner takes a player without the app back out of the lobby (a typo, or they got the app after all). */
app.delete("/events/:code/players/no-app/:slot", async (c) => {
  const event = await loadEvent(c);
  const players = await db.getPlayers(c.env.DB, event.code);
  ownerOnly(caller(c, players), "remove a player");
  if (event.status !== "lobby") throw new HttpError(409, "This game has already started");
  const p = players.find((x) => x.slot === Number(c.req.param("slot")));
  if (!p || !p.no_app) throw new HttpError(404, "No player without the app in that place");
  await db.deletePlayer(c.env.DB, event.code, p.player_id);
  await push(c, event.code, { type: "players" });
  return c.body(null, 204);
});

/**
 * Leave the game. Before play starts this frees the place; if the creator leaves the lobby, the
 * game is cancelled (nobody else can set partnerships). Leaving during play isn't done here: the
 * seat stays the player's (they can rejoin with the code), and anyone can take it over by asking
 * for it (seat requests, below).
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
  ownerOnly(me, "choose partnerships");
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
  if (onDevicesMode(event.mode)) await startOnDevices(c, event.code, currentBoard(event), me.slot);
  return c.json({ seats: Object.fromEntries(seats) });
});

/**
 * The owner moves the table to a board; every device follows. Played on the devices, the board's
 * auction starts straight away (one board at a time, so not while another is being played).
 */
app.put("/events/:code/current", async (c) => {
  const event = await loadEvent(c);
  const me = caller(c, await db.getPlayers(c.env.DB, event.code));
  ownerOnly(me, "move the table to another board");
  if (event.status !== "playing") throw new HttpError(409, "The game isn't in play");
  const board = Number((await body<CurrentBoardRequest>(c)).board);
  const game = JSON.parse(event.game_json) as GameFileV1;
  if (!game.boards.some((b) => b.number === board)) throw new HttpError(404, `Board ${board} isn't in this game`);
  if (onDevicesMode(event.mode) && !(await startOnDevices(c, event.code, board, me.slot))) {
    throw new HttpError(409, "Another board is being played on the devices; finish it first");
  }
  await db.setCurrentBoard(c.env.DB, event.code, board);
  await push(c, event.code, { type: "board", board });
  return c.json({ board });
});

/**
 * Save or correct a board's result, or just its contract (`tricks: null`) once the bidding is over.
 * Only the owner can: the table talks it over, and one person enters it.
 */
app.put("/events/:code/boards/:board", async (c) => {
  const event = await loadEvent(c);
  const me = caller(c, await db.getPlayers(c.env.DB, event.code));
  ownerOnly(me, "enter or correct results");
  if (event.status !== "playing") throw new HttpError(409, "Results can only be entered while the game is in play");

  const board = Number(c.req.param("board"));
  const game = JSON.parse(event.game_json) as GameFileV1;
  if (!game.boards.some((b) => b.number === board)) throw new HttpError(404, `Board ${board} isn't in this game`);

  const req = await body<SaveResultRequest>(c);
  const contractOnly = req.tricks === null;
  // A full result can always be entered (it ends play on the devices); the contract can't change
  // under the cards being played.
  const current = await db.getResult(c.env.DB, event.code, board);
  if (contractOnly && current?.onDevices && current.tricks === null) {
    throw new HttpError(409, "The cards are being played on this board, so the contract can't change now");
  }
  let parsed;
  try {
    // A contract on its own is checked like a full result, with a stand-in trick count.
    parsed = tableResult(String(req.contract ?? ""), req.declarer ?? null, contractOnly ? 0 : (req.tricks ?? undefined));
  } catch (e) {
    throw new HttpError(400, (e as Error).message);
  }
  const result: ResultDto = {
    onDevices: current?.onDevices ?? false,
    board,
    contract: parsed.contract ? String(req.contract).toUpperCase().replace(/\s+/g, "") : "PASS",
    declarer: parsed.declarer,
    // Passed out needs no play, so it's a complete result straight away.
    tricks: contractOnly && parsed.contract ? null : parsed.tricks,
    enteredBy: me.slot,
    updatedAt: nowIso(),
  };
  await db.upsertResult(c.env.DB, event.code, result);
  await push(c, event.code, { type: "result", result });
  return c.json(result);
});

// ---- Playing the cards on the devices ------------------------------------------------------------

/** The board's game data and its result row, for the card-play routes. */
async function boardInPlay(c: Ctx, event: db.EventRow) {
  if (event.status !== "playing") throw new HttpError(409, "The game isn't in play");
  const number = Number(c.req.param("board"));
  const board = parseGameFile(JSON.parse(event.game_json)).boards.find((b) => b.number === number);
  if (!board) throw new HttpError(404, `Board ${number} isn't in this game`);
  return { board, result: await db.getResult(c.env.DB, event.code, number) };
}

/**
 * Play a board online, on the devices: its auction, then its cards. When the contract was already
 * entered by hand, it starts at the card play. Only the owner can. A game played on the devices
 * starts each board this way by itself (`startOnDevices`); this starts one by hand. One board at a
 * time: the table plays it together, until its result is in.
 */
app.post("/events/:code/boards/:board/play", async (c) => {
  const event = await loadEvent(c);
  const me = caller(c, await db.getPlayers(c.env.DB, event.code));
  ownerOnly(me, "start playing on the devices");
  const { board, result } = await boardInPlay(c, event);
  if (result && result.tricks !== null) throw new HttpError(409, "This board already has a result");
  const other = (await db.getResults(c.env.DB, event.code)).find(
    (r) => r.onDevices && r.tricks === null && r.board !== board.number,
  );
  if (other) throw new HttpError(409, `Board ${other.board} is being played on the devices; finish it first`);
  if (result?.declarer) {
    // The contract is in: straight to the cards.
    if (!result.onDevices) await db.setOnDevices(c.env.DB, event.code, board.number, true, nowIso());
  } else if (!result?.onDevices) {
    await db.startAuction(c.env.DB, event.code, board.number, me.slot, nowIso());
  }
  const started = (await db.getResult(c.env.DB, event.code, board.number))!;
  await push(c, event.code, { type: "result", result: started });
  return c.json(started);
});

/**
 * Make a call in a board's auction on the devices. It must be your turn (the creator calls for a
 * bot), and the call must be allowed: the same rules the devices use. When the auction ends, the
 * contract goes into the result and the card play starts; passed out, the board is done.
 */
app.post("/events/:code/boards/:board/calls", async (c) => {
  const event = await loadEvent(c);
  const players = await db.getPlayers(c.env.DB, event.code);
  const me = caller(c, players);
  const { board, result } = await boardInPlay(c, event);
  if (!result?.onDevices || result.tricks !== null || result.contract !== "") {
    throw new HttpError(409, "This board isn't being bid on the devices");
  }
  const req = await body<CallRequest>(c);
  const call = parseCall(String(req.call ?? ""));
  if (!call) throw new HttpError(400, "That isn't a bid");
  const made = await db.getCalls(c.env.DB, event.code, board.number);
  if (req.seq !== made.length + 1) throw new HttpError(409, "That bid has already been made, or the bidding has moved on");
  const calls = made.map((k) => parseCall(k.call)!);
  const seat = toCall(board.dealer, calls);
  const forBot = me.is_creator === 1 && players.some((p) => p.seat === seat && p.is_bot === 1);
  if (me.seat !== seat && !forBot) throw new HttpError(409, "It isn't your turn");
  if (!canCall(board.dealer, calls, call)) throw new HttpError(400, "That bid isn't allowed now");

  const dto: CallDto = { board: board.number, seq: req.seq, seat, call: callCode(call) };
  if (!(await db.insertCall(c.env.DB, event.code, dto, nowIso()))) {
    throw new HttpError(409, "That bid has already been made, or the bidding has moved on");
  }
  await push(c, event.code, { type: "call", call: dto });

  const end = auctionResult(board.dealer, [...calls, call]);
  if (end) {
    // Passed out is a complete result; otherwise the contract is in and the cards come next. In
    // bidding practice there's no card play: the contract takes the tricks double dummy says it
    // does, or, without double dummy in the game file, the board ends with just its contract.
    const scored = event.mode === "bidding" ? doubleDummyResult(board.doubleDummy, end.contract, end.declarer) : null;
    const done: ResultDto = {
      ...result,
      contract: contractCode(end.contract),
      declarer: end.declarer,
      tricks: end.contract ? (scored?.tricks ?? null) : 0,
      enteredBy: me.slot,
      updatedAt: nowIso(),
    };
    await db.upsertResult(c.env.DB, event.code, done);
    if (event.mode === "bidding" && done.tricks === null) {
      await db.endWithoutPlay(c.env.DB, event.code, board.number, done.updatedAt);
      done.onDevices = false;
    }
    await push(c, event.code, { type: "result", result: done });
  }
  return c.json(dto);
});

/**
 * A board being played on the devices, as it stands: the position after the cards so far, and
 * any claim. Throws unless the board is being played (started, and its result not yet entered).
 */
async function liveBoard(c: Ctx, event: db.EventRow) {
  const { board, result } = await boardInPlay(c, event);
  if (!result?.onDevices || result.tricks !== null || !result.declarer) {
    throw new HttpError(409, "This board isn't being played on the devices");
  }
  const contract = tableResult(result.contract, result.declarer, 0).contract!;
  const [plays, claim] = await Promise.all([
    db.getPlays(c.env.DB, event.code, board.number),
    db.getClaim(c.env.DB, event.code, board.number),
  ]);
  const state = replay(board.hands, contract.strain, result.declarer, plays.map((p) => parseCard(p.card)!));
  return { board, result, declarer: result.declarer, plays, claim, state };
}

/**
 * Play is over (the last card, or a claim accepted): save the result for everyone, worked out
 * with the same rules the devices use. `by` is the slot of whoever ended it.
 */
async function finishBoard(c: Ctx, code: string, result: ResultDto, tricks: number, by: number) {
  const done: ResultDto = { ...result, tricks, enteredBy: by, updatedAt: nowIso() };
  await db.upsertResult(c.env.DB, code, done);
  await push(c, code, { type: "result", result: done });
}

/**
 * Play a card. It must be your turn (declarer also plays dummy's cards), and the card must be
 * legal: the same rules the devices use. The last card saves the board's result.
 */
app.post("/events/:code/boards/:board/cards", async (c) => {
  const event = await loadEvent(c);
  const players = await db.getPlayers(c.env.DB, event.code);
  const me = caller(c, players);
  const { board, result, declarer, plays, claim, state } = await liveBoard(c, event);
  if (claim) throw new HttpError(409, "There's a claim to answer first");
  const req = await body<PlayCardRequest>(c);
  const card = parseCard(String(req.card ?? ""));
  if (!card) throw new HttpError(400, "That isn't a card");
  if (req.seq !== plays.length + 1) throw new HttpError(409, "That card has already been played, or play has moved on");
  if (isComplete(state)) throw new HttpError(409, "All the cards have been played");

  // Whose turn it is, and who plays it: declarer plays dummy's cards, and the creator plays a bot's.
  const seat = toPlay(state);
  const player = seat === dummyOf(declarer) ? declarer : seat;
  const forBot = me.is_creator === 1 && players.some((p) => p.seat === player && p.is_bot === 1);
  if (me.seat !== player && !forBot) throw new HttpError(409, "It isn't your turn");
  let after;
  try {
    after = playCard(state, card);
  } catch (e) {
    throw new HttpError(400, (e as Error).message);
  }

  const play: PlayDto = { board: board.number, seq: req.seq, seat, card: cardCode(card) };
  if (!(await db.insertPlay(c.env.DB, event.code, play, nowIso()))) {
    throw new HttpError(409, "That card has already been played, or play has moved on");
  }
  await push(c, event.code, { type: "play", play });
  if (isComplete(after)) await finishBoard(c, event.code, result, finalTricks(after, null)!, me.slot);
  return c.json(play);
});

/**
 * The seat a claim or an answer is for: the caller's own, or (the owner only) a bot's, named in the
 * request. Throws unless it's allowed.
 */
function actingSeat(me: db.PlayerRow, players: db.PlayerRow[], requested: unknown): Seat {
  if (requested === undefined || requested === null || requested === me.seat) {
    if (!me.seat) throw new HttpError(403, "You're not at the table");
    return me.seat;
  }
  const bot = players.find((p) => p.seat === requested && p.is_bot === 1);
  if (!bot || me.is_creator !== 1) throw new HttpError(403, "Only the game's owner acts for a bot");
  return bot.seat!;
}

/**
 * Claim: say how many of the tricks still to play your side will take. Your cards are shown to
 * everyone, and play stops until it's answered. Declarer or a defender can claim (not dummy). The
 * owner's device claims for a bot, and answers for bots: they check a claim before accepting it.
 */
app.post("/events/:code/boards/:board/claim", async (c) => {
  const event = await loadEvent(c);
  const players = await db.getPlayers(c.env.DB, event.code);
  const me = caller(c, players);
  const { board, declarer, claim, state } = await liveBoard(c, event);
  const req = await body<ClaimRequest>(c);
  const seat = actingSeat(me, players, req.seat);
  if (seat === dummyOf(declarer)) throw new HttpError(403, "Dummy can't claim");
  if (claim) throw new HttpError(409, "There's already a claim");
  if (isComplete(state)) throw new HttpError(409, "All the cards have been played");
  const left = tricksLeft(state);
  if (!Number.isInteger(req.tricks) || req.tricks < 0 || req.tricks > left) {
    throw new HttpError(400, `Claim between 0 and ${left} tricks`);
  }
  const made: ClaimDto = { board: board.number, seat, tricks: req.tricks, acceptedBy: [] };
  await db.insertClaim(c.env.DB, event.code, made, nowIso());
  await push(c, event.code, { type: "claim", board: board.number, claim: made });
  return c.json(made);
});

/**
 * Accept or refuse a claim. The claimer's opponents answer (declarer alone, when a defender
 * claims: dummy doesn't). One refusal ends the claim and play goes on; when everyone who answers
 * has accepted, the board's result is saved.
 */
app.post("/events/:code/boards/:board/claim/answer", async (c) => {
  const event = await loadEvent(c);
  const players = await db.getPlayers(c.env.DB, event.code);
  const me = caller(c, players);
  const { board, result, declarer, claim, state } = await liveBoard(c, event);
  if (!claim) throw new HttpError(409, "There's no claim to answer");
  if (claimAccepted(claim, declarer)) throw new HttpError(409, "The claim has already been accepted");
  const req = await body<AnswerClaimRequest>(c);
  const seat = actingSeat(me, players, req.seat);
  if (!claimAnswerers(claim.seat, declarer).includes(seat)) {
    throw new HttpError(403, "Only the claimer's opponents answer a claim");
  }
  if (!req.accept) {
    await db.deleteClaim(c.env.DB, event.code, board.number);
    await push(c, event.code, { type: "claim", board: board.number, claim: null });
    return c.json(null);
  }
  const answered: ClaimDto = { ...claim, acceptedBy: [...new Set([...claim.acceptedBy, seat])] };
  await db.setClaimAccepted(c.env.DB, event.code, board.number, answered.acceptedBy);
  await push(c, event.code, { type: "claim", board: board.number, claim: answered });
  if (claimAccepted(answered, declarer)) await finishBoard(c, event.code, result, finalTricks(state, answered)!, me.slot);
  return c.json(answered);
});

/** The claimer takes back a claim nobody has finished accepting. */
app.delete("/events/:code/boards/:board/claim", async (c) => {
  const event = await loadEvent(c);
  const me = caller(c, await db.getPlayers(c.env.DB, event.code));
  const { board, declarer, claim } = await liveBoard(c, event);
  if (!claim) return c.body(null, 204);
  if (me.seat !== claim.seat) throw new HttpError(403, "Only the player who claimed can take it back");
  if (claimAccepted(claim, declarer)) throw new HttpError(409, "The claim has been accepted");
  await db.deleteClaim(c.env.DB, event.code, board.number);
  await push(c, event.code, { type: "claim", board: board.number, claim: null });
  return c.body(null, 204);
});

/** Results changed since a timestamp: how a phone catches up after reconnecting. */
app.get("/events/:code/results", async (c) => {
  const event = await loadEvent(c);
  caller(c, await db.getPlayers(c.env.DB, event.code));
  const since = c.req.query("since") || undefined;
  const now = nowIso(); // before reading, as above
  return c.json<ResultsSinceResponse>({
    results: await db.getResults(c.env.DB, event.code, since),
    currentBoard: currentBoard(event),
    now,
  });
});

/** End the game. Only the owner can (the app asks them to confirm). */
app.post("/events/:code/end", async (c) => {
  const event = await loadEvent(c);
  ownerOnly(caller(c, await db.getPlayers(c.env.DB, event.code)), "end the game");
  if (event.status === "ended") return c.body(null, 204);
  await db.setStatus(c.env.DB, event.code, "ended");
  await push(c, event.code, { type: "status", status: "ended" });
  return c.body(null, 204);
});

/** Delete the game and its results. Creator only. */
app.delete("/events/:code", async (c) => {
  const event = await loadEvent(c);
  const me = caller(c, await db.getPlayers(c.env.DB, event.code));
  ownerOnly(me, "delete it");
  await db.deleteEvent(c.env.DB, event.code);
  await push(c, event.code, { type: "deleted" });
  return c.body(null, 204);
});

/**
 * A single-use pass for opening the live connection. Browsers can't set headers on a WebSocket,
 * and the secret player ID mustn't go in its address (addresses end up in logs), so the device
 * swaps its ID (sent in the header as usual) for a short-lived pass, and puts that in the address.
 */
app.post("/events/:code/live-ticket", async (c) => {
  const event = await loadEvent(c);
  const me = caller(c, await db.getPlayers(c.env.DB, event.code));
  return c.json<LiveTicketResponse>({ ticket: await hub(c.env, event.code).issueTicket(me.slot, me.player_id) });
});

/** Live updates (`?ticket=` from live-ticket). The game's EventHub checks the pass. */
app.get("/events/:code/live", async (c) => {
  if (c.req.header("Upgrade") !== "websocket") throw new HttpError(400, "Expected a WebSocket upgrade");
  const event = await loadEvent(c);
  return hub(c.env, event.code).fetch(c.req.raw);
});

// ---- Seat requests: taking over a seat --------------------------------------------------------------
//
// Someone with the code can ask to take over a player's seat, in the lobby or during play: to
// replace a player, or to carry on as themselves on another device (the owner starting a game on a
// computer, then moving to their phone). Anyone at the table can allow or deny it, and the first
// answer wins; when nobody is connected to answer, it's allowed straight away. Allowing it hands
// the seat (its results, and being the owner) to the requester's new key; the old key stops
// working and the old device is disconnected.

/** Ask for a seat. Returns the requester's key, which they use to check on the request. */
app.post("/events/:code/requests", async (c) => {
  const event = await loadEvent(c);
  const req = await body<SeatRequestRequest>(c);
  const name = cleanName(req.name);
  if (event.status === "ended") throw new HttpError(409, "This game has ended");
  const players = await db.getPlayers(c.env.DB, event.code);
  const slot = Number(req.slot);
  if (!players.some((p) => p.slot === slot)) throw new HttpError(400, "Pick one of the players");
  const pending = await db.getPendingSeatRequests(c.env.DB, event.code, requestCutoff());
  if (pending.length >= MAX_PENDING_REQUESTS) {
    throw new HttpError(409, "Too many requests are waiting for this game. Try again in a few minutes.");
  }

  const row: db.SeatRequestRow = {
    id: newPlayerId(),
    slot,
    name,
    player_id: newPlayerId(),
    status: "pending",
    answered_by: null,
    created_at: nowIso(),
  };
  await db.insertSeatRequest(c.env.DB, event.code, row);
  // Nobody there to answer: hand the seat over now rather than leave them waiting.
  const nobodyThere = (await hub(c.env, event.code).connectedSlots()).length === 0;
  if (nobodyThere && (await db.closeSeatRequest(c.env.DB, event.code, row.id, "allowed", null))) {
    await handOver(c, event.code, players, row, null);
    return c.json<SeatRequestCreated>({ requestId: row.id, playerId: row.player_id, status: "allowed" }, 201);
  }
  await push(c, event.code, { type: "request", request: db.toSeatRequest(row) });
  return c.json<SeatRequestCreated>({ requestId: row.id, playerId: row.player_id, status: "pending" }, 201);
});

/** The requester's own request, checked with their key. */
async function ownRequest(c: Ctx, code: string): Promise<db.SeatRequestRow> {
  const r = await db.getSeatRequest(c.env.DB, code, c.req.param("id") ?? "");
  if (!r || r.player_id !== c.req.header("X-Player-Id")) throw new HttpError(404, "No such request");
  return r;
}

/** How the requester's request stands. Once it's allowed, their key works as a player's. */
app.get("/events/:code/requests/:id", async (c) => {
  const event = await loadEvent(c);
  const r = await ownRequest(c, event.code);
  const status = r.status === "pending" && r.created_at <= requestCutoff() ? "expired" : r.status;
  return c.json<SeatRequestState>({ status });
});

/** The requester gives up waiting. */
app.delete("/events/:code/requests/:id", async (c) => {
  const event = await loadEvent(c);
  const r = await ownRequest(c, event.code);
  if (await db.closeSeatRequest(c.env.DB, event.code, r.id, "cancelled", null)) {
    const replacedName = (await db.getPlayers(c.env.DB, event.code)).find((p) => p.slot === r.slot)?.name ?? "";
    await push(c, event.code, { type: "requestClosed", request: db.toSeatRequest(r), outcome: "cancelled", by: null, replacedName });
  }
  return c.body(null, 204);
});

/** Anyone at the table allows or denies a request. The first answer wins. */
app.post("/events/:code/requests/:id/answer", async (c) => {
  const event = await loadEvent(c);
  const players = await db.getPlayers(c.env.DB, event.code);
  const me = caller(c, players);
  const { allow } = await body<AnswerSeatRequest>(c);
  const r = await db.getSeatRequest(c.env.DB, event.code, c.req.param("id") ?? "");
  if (!r) throw new HttpError(404, "No such request");
  if (r.status !== "pending" || r.created_at <= requestCutoff()) {
    throw new HttpError(409, "That request has already been answered or has lapsed");
  }
  if (!(await db.closeSeatRequest(c.env.DB, event.code, r.id, allow ? "allowed" : "denied", me.slot))) {
    throw new HttpError(409, "Someone else answered it first");
  }

  if (!allow || !players.some((p) => p.slot === r.slot)) {
    await push(c, event.code, closedMessage(players, r, "denied", me.slot));
    return c.body(null, 204);
  }
  await handOver(c, event.code, players, r, me.slot);
  return c.body(null, 204);
});

function closedMessage(
  players: db.PlayerRow[],
  r: db.SeatRequestRow,
  outcome: "allowed" | "denied",
  by: number | null,
): PushMessage {
  return {
    type: "requestClosed",
    request: db.toSeatRequest(r),
    outcome,
    by,
    replacedName: players.find((p) => p.slot === r.slot)?.name ?? "",
  };
}

/**
 * A request already closed as allowed: the seat goes to the requester, anyone else waiting for it
 * is turned down (it's taken now), and the old device is told and cut off. `by` is who allowed it
 * (null: nobody was connected to answer).
 */
async function handOver(c: Ctx, code: string, players: db.PlayerRow[], r: db.SeatRequestRow, by: number | null) {
  const old = players.find((p) => p.slot === r.slot)!;
  await db.replacePlayer(c.env.DB, code, r.slot, r.player_id, r.name);
  const others = (await db.getPendingSeatRequests(c.env.DB, code, requestCutoff())).filter((x) => x.slot === r.slot);
  for (const x of others) await db.closeSeatRequest(c.env.DB, code, x.id, "denied", by);

  const h = hub(c.env, code);
  const messages = [
    closedMessage(players, r, "allowed", by),
    ...others.map((x) => closedMessage(players, x, "denied", by)),
    { type: "players" } as const,
  ];
  // In order: everyone hears the news (the old device too, so it can say why it's leaving), then
  // the old device is cut off.
  c.executionCtx.waitUntil(
    (async () => {
      for (const m of messages) await h.notify(m);
      await h.closePlayer(old.player_id);
    })().catch((e) => console.error("push failed", e)),
  );
}

/** Dev only: fill the empty places with test players so a game can start from one device. */
app.post("/events/:code/test-players", async (c) => {
  if (c.env.ALLOW_TEST_PLAYERS !== "true") throw new HttpError(404, "Not found");
  const event = await loadEvent(c);
  if (event.status !== "lobby") throw new HttpError(409, "This game has already started");
  const added = await addBots(c, event.code);
  if (added.length) await push(c, event.code, { type: "players" });
  return c.json({ added });
});

/** Fills a game's empty places with bots ("Bot 2"…: the number is the place). Returns the places filled. */
async function addBots(c: Ctx, code: string): Promise<number[]> {
  const players = await db.getPlayers(c.env.DB, code);
  const added: number[] = [];
  for (let slot = nextFreeSlot(players); slot !== null; slot = nextFreeSlot(players)) {
    const row = { player_id: newPlayerId(), slot, name: `Bot ${slot}`, is_creator: 0, is_bot: 1, no_app: 0, seat: null, system_json: null };
    await db.insertPlayer(c.env.DB, code, row, nowIso());
    players.push(row);
    added.push(slot);
  }
  return added;
}

app.all("*", (c) => c.json({ error: "Not found" }, 404));

// ---- Nightly clean-up -----------------------------------------------------------------------------

/**
 * Delete games past their expiry (30 days after creation) and everything in them. Expired games
 * are already unreachable (loadEvent ignores them); this removes them from the database. Run by
 * the cron trigger in wrangler.jsonc; each run is logged, so it shows in the Worker's logs.
 */
export async function cleanUp(env: Env, now = new Date()): Promise<string[]> {
  const deleted = await db.deleteExpiredEvents(env.DB, now.toISOString());
  console.log(
    `Nightly clean-up: deleted ${deleted.length} expired ${deleted.length === 1 ? "game" : "games"}` +
      (deleted.length ? ` (${deleted.join(", ")})` : ""),
  );
  return deleted;
}

export default {
  fetch: app.fetch,
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(
      cleanUp(env).catch((e) => {
        console.error("Nightly clean-up failed", e);
      }),
    );
  },
} satisfies ExportedHandler<Env>;

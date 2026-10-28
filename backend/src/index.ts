// Bridge Replay API. All routes are under /api; see docs/DESIGN.md ("Backend") for the design.
//
// Identity: no accounts. Creating or joining a game returns a secret `playerId`, which the phone
// keeps and sends back in the X-Player-Id header. Other players only ever see a public `slot` (1–4).

import { Hono, type Context } from "hono";
import { tableResult } from "../../frontend/src/core/contract";
import {
  cardCode,
  claimAccepted,
  claimAnswerers,
  dummyOf,
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
  AnswerSeatRequest,
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

function nextFreeSlot(players: db.PlayerRow[]): number | null {
  for (let s = 1; s <= MAX_PLAYERS; s++) if (!players.some((p) => p.slot === s)) return s;
  return null;
}

// ---- Routes -------------------------------------------------------------------------------------

/** Create a game from a game file; the creator joins as slot 1. */
app.post("/events", async (c) => {
  if (Number(c.req.header("Content-Length") ?? 0) > MAX_GAME_BYTES) throw new HttpError(413, "Game file too large");
  const req = await body<CreateEventRequest>(c);
  return c.json<JoinedResponse>(await createEvent(c, cleanName(req.name), req.game, req.startBoard), 201);
});

/**
 * A demo game, for trying the app alone: the built-in synthetic game (made-up results), starting at
 * board 9 to show a game needn't start at 1, with the other three places filled by bots. You land
 * in the lobby to pick partners. Bots are allowed here in the live app because the game is ours.
 */
app.post("/events/demo", async (c) => {
  const req = await body<JoinRequest>(c);
  const joined = await createEvent(c, cleanName(req.name), demoGame as unknown as GameFileV1, DEMO_START_BOARD);
  await addBots(c, joined.code);
  return c.json<JoinedResponse>(joined, 201);
});

/** Validates the game file, then creates the game with you as its first player. */
async function createEvent(c: Ctx, name: string, file: GameFileV1, start: number | undefined): Promise<JoinedResponse> {
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
  const creator: db.PlayerRow = { player_id: playerId, slot: 1, name, is_creator: 1, is_bot: 0, seat: null };

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
  const [players, results, plays, claims, connected, requests] = await Promise.all([
    db.getPlayers(c.env.DB, event.code),
    db.getResults(c.env.DB, event.code),
    db.getLivePlays(c.env.DB, event.code),
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
    startBoard: event.start_board,
    game: JSON.parse(event.game_json) as GameFileV1,
    players: players.map((p) => ({
      slot: p.slot,
      name: p.name,
      isCreator: p.is_creator === 1,
      isBot: p.is_bot === 1,
      seat: p.seat,
      connected: connected.includes(p.slot),
    })),
    results,
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
  const name = cleanName((await body<JoinRequest>(c)).name);
  if (event.status !== "lobby") throw new HttpError(409, "This game has already started");
  const players = await db.getPlayers(c.env.DB, event.code);
  const slot = nextFreeSlot(players);
  if (slot === null) throw new HttpError(409, "This game already has 4 players");

  const playerId = newPlayerId();
  try {
    await db.insertPlayer(c.env.DB, event.code, { player_id: playerId, slot, name, is_creator: 0, is_bot: 0, seat: null }, nowIso());
  } catch (e) {
    if (String(e).includes("UNIQUE")) throw new HttpError(409, "Someone else just took that place; try again");
    throw e;
  }
  await push(c, event.code, { type: "players" });
  return c.json<JoinedResponse>({ code: event.code, playerId, slot }, 201);
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

/**
 * Save or correct a board's result, or just its contract (`tricks: null`) once the bidding is over.
 * Any seated player can.
 */
app.put("/events/:code/boards/:board", async (c) => {
  const event = await loadEvent(c);
  const me = caller(c, await db.getPlayers(c.env.DB, event.code));
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
 * Start playing a board's cards on the devices, once its contract is in. For now only the game's
 * creator can, board by board, while it's being tried out. One board at a time: the table plays
 * it together, until its result is entered.
 */
app.post("/events/:code/boards/:board/play", async (c) => {
  const event = await loadEvent(c);
  const me = caller(c, await db.getPlayers(c.env.DB, event.code));
  if (!me.is_creator) throw new HttpError(403, "Only the player who started the game can start playing on devices");
  const { board, result } = await boardInPlay(c, event);
  if (!result || result.tricks !== null || !result.declarer || result.contract === "PASS") {
    throw new HttpError(409, "Enter the contract first");
  }
  const other = (await db.getResults(c.env.DB, event.code)).find(
    (r) => r.onDevices && r.tricks === null && r.board !== board.number,
  );
  if (other) throw new HttpError(409, `Board ${other.board} is being played on the devices; finish it first`);
  if (!result.onDevices) {
    await db.setOnDevices(c.env.DB, event.code, board.number, true, nowIso());
  }
  const started = (await db.getResult(c.env.DB, event.code, board.number))!;
  await push(c, event.code, { type: "result", result: started });
  return c.json(started);
});

/** Stop playing a board on the devices: the cards played so far are thrown away. Creator only. */
app.delete("/events/:code/boards/:board/play", async (c) => {
  const event = await loadEvent(c);
  const me = caller(c, await db.getPlayers(c.env.DB, event.code));
  if (!me.is_creator) throw new HttpError(403, "Only the player who started the game can stop playing on devices");
  const { board, result } = await boardInPlay(c, event);
  if (!result?.onDevices) return c.body(null, 204);
  await db.setOnDevices(c.env.DB, event.code, board.number, false, nowIso());
  await push(c, event.code, { type: "result", result: (await db.getResult(c.env.DB, event.code, board.number))! });
  return c.body(null, 204);
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
  return { board, declarer: result.declarer, plays, claim, state };
}

/**
 * Play a card. It must be your turn (declarer also plays dummy's cards), and the card must be
 * legal: the same rules the devices use. After the last card the board waits for someone to enter
 * the result (the devices work it out from the tricks).
 */
app.post("/events/:code/boards/:board/cards", async (c) => {
  const event = await loadEvent(c);
  const players = await db.getPlayers(c.env.DB, event.code);
  const me = caller(c, players);
  const { board, declarer, plays, claim, state } = await liveBoard(c, event);
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
  try {
    playCard(state, card);
  } catch (e) {
    throw new HttpError(400, (e as Error).message);
  }

  const play: PlayDto = { board: board.number, seq: req.seq, seat, card: cardCode(card) };
  if (!(await db.insertPlay(c.env.DB, event.code, play, nowIso()))) {
    throw new HttpError(409, "That card has already been played, or play has moved on");
  }
  await push(c, event.code, { type: "play", play });
  return c.json(play);
});

/**
 * Claim: say how many of the tricks still to play your side will take. Your cards are shown to
 * everyone, and play stops until it's answered. Declarer or a defender can claim (not dummy).
 */
app.post("/events/:code/boards/:board/claim", async (c) => {
  const event = await loadEvent(c);
  const players = await db.getPlayers(c.env.DB, event.code);
  const me = caller(c, players);
  const { board, declarer, claim, state } = await liveBoard(c, event);
  if (!me.seat || me.seat === dummyOf(declarer)) throw new HttpError(403, "Dummy can't claim");
  if (claim) throw new HttpError(409, "There's already a claim");
  if (isComplete(state)) throw new HttpError(409, "All the cards have been played");
  const req = await body<ClaimRequest>(c);
  const left = tricksLeft(state);
  if (!Number.isInteger(req.tricks) || req.tricks < 0 || req.tricks > left) {
    throw new HttpError(400, `Claim between 0 and ${left} tricks`);
  }
  // Bots accept every claim straight away.
  const bots = claimAnswerers(me.seat, declarer).filter((s) => players.some((p) => p.seat === s && p.is_bot === 1));
  const made: ClaimDto = { board: board.number, seat: me.seat, tricks: req.tricks, acceptedBy: bots };
  await db.insertClaim(c.env.DB, event.code, made, nowIso());
  if (bots.length) await db.setClaimAccepted(c.env.DB, event.code, board.number, bots);
  await push(c, event.code, { type: "claim", board: board.number, claim: made });
  return c.json(made);
});

/**
 * Accept or refuse a claim. The claimer's opponents answer (declarer alone, when a defender
 * claims: dummy doesn't). One refusal ends the claim and play goes on; when everyone who answers
 * has accepted, the board waits for its result to be entered.
 */
app.post("/events/:code/boards/:board/claim/answer", async (c) => {
  const event = await loadEvent(c);
  const me = caller(c, await db.getPlayers(c.env.DB, event.code));
  const { board, declarer, claim } = await liveBoard(c, event);
  if (!claim) throw new HttpError(409, "There's no claim to answer");
  if (claimAccepted(claim, declarer)) throw new HttpError(409, "The claim has already been accepted");
  if (!me.seat || !claimAnswerers(claim.seat, declarer).includes(me.seat)) {
    throw new HttpError(403, "Only the claimer's opponents answer a claim");
  }
  const req = await body<AnswerClaimRequest>(c);
  if (!req.accept) {
    await db.deleteClaim(c.env.DB, event.code, board.number);
    await push(c, event.code, { type: "claim", board: board.number, claim: null });
    return c.json(null);
  }
  const answered: ClaimDto = { ...claim, acceptedBy: [...new Set([...claim.acceptedBy, me.seat])] };
  await db.setClaimAccepted(c.env.DB, event.code, board.number, answered.acceptedBy);
  await push(c, event.code, { type: "claim", board: board.number, claim: answered });
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
// When a game is full or has started, someone with the code can ask to take over a seat: to replace
// a player, or to carry on as themselves on another device. Anyone at the table can allow or deny
// it, and the first answer wins. Allowing it hands the seat (and its results) to the requester's
// new key; the old key stops working and the old device is disconnected.

/** Ask for a seat. Returns the requester's key, which they use to check on the request. */
app.post("/events/:code/requests", async (c) => {
  const event = await loadEvent(c);
  const req = await body<SeatRequestRequest>(c);
  const name = cleanName(req.name);
  if (event.status === "ended") throw new HttpError(409, "This game has ended");
  const players = await db.getPlayers(c.env.DB, event.code);
  if (nextFreeSlot(players) !== null) throw new HttpError(409, "This game still has room: join it instead");
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
  await push(c, event.code, { type: "request", request: db.toSeatRequest(row) });
  const connected = await hub(c.env, event.code).connectedSlots();
  return c.json<SeatRequestCreated>({ requestId: row.id, playerId: row.player_id, anyoneConnected: connected.length > 0 }, 201);
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

  const old = players.find((p) => p.slot === r.slot);
  const closed = (outcome: "allowed" | "denied", req: db.SeatRequestRow): PushMessage => ({
    type: "requestClosed",
    request: db.toSeatRequest(req),
    outcome,
    by: me.slot,
    replacedName: old?.name ?? "",
  });
  if (!allow || !old) {
    await push(c, event.code, closed("denied", r));
    return c.body(null, 204);
  }

  await db.replacePlayer(c.env.DB, event.code, r.slot, r.player_id, r.name);
  // Anyone else waiting for the same seat is turned down: it's taken now.
  const others = (await db.getPendingSeatRequests(c.env.DB, event.code, requestCutoff())).filter((x) => x.slot === r.slot);
  for (const x of others) await db.closeSeatRequest(c.env.DB, event.code, x.id, "denied", me.slot);

  const h = hub(c.env, event.code);
  const messages = [closed("allowed", r), ...others.map((x) => closed("denied", x)), { type: "players" } as const];
  // In order: everyone hears the news (the old device too, so it can say why it's leaving), then
  // the old device is cut off.
  c.executionCtx.waitUntil(
    (async () => {
      for (const m of messages) await h.notify(m);
      await h.closePlayer(old.player_id);
    })().catch((e) => console.error("push failed", e)),
  );
  return c.body(null, 204);
});

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
    const row = { player_id: newPlayerId(), slot, name: `Bot ${slot}`, is_creator: 0, is_bot: 1, seat: null };
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

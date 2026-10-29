import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type {
  ClaimDto,
  EventSnapshot,
  JoinedResponse,
  LiveTicketResponse,
  PushMessage,
  PlayDto,
  ResultDto,
  SeatRequestCreated,
  SeatRequestState,
} from "../src/api-types";
import { chooseCard } from "../../frontend/src/core/bot";
import { parseHand } from "../../frontend/src/core/deal";
import { cardCode, dummyOf, isComplete, parseCard, playCard, replay, toPlay, tricksWon } from "../../frontend/src/core/play";
import type { Seat } from "../../frontend/src/core/types";
import { cleanUp } from "../src/index";
import { assignSeats } from "../src/seats";
import game from "./fixtures/game.json";

// ---- Helpers ------------------------------------------------------------------------------------

async function api<T = unknown>(method: string, path: string, body?: unknown, playerId?: string) {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (playerId) headers["X-Player-Id"] = playerId;
  const res = await SELF.fetch(`https://bridge.test/api${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, json: (text ? JSON.parse(text) : null) as T };
}

/** Creator + 3 joiners, still in the lobby. */
async function lobbyOfFour() {
  const created = await api<JoinedResponse>("POST", "/events", { name: "Marc", game, startBoard: 1 });
  const { code } = created.json;
  const others = [];
  for (const name of ["Ann", "Bob", "Cy"]) {
    others.push((await api<JoinedResponse>("POST", `/events/${code}/players`, { name })).json);
  }
  return { code, creator: created.json, others };
}

/** A game in play, with Ann (slot 2) as the creator's partner. */
async function gameInPlay() {
  const g = await lobbyOfFour();
  await api("POST", `/events/${g.code}/partnerships`, { partnerSlot: 2 }, g.creator.playerId);
  return g;
}

/** Open a live connection and collect the messages it receives. */
async function connect(code: string, playerId: string) {
  const { ticket } = (await api<LiveTicketResponse>("POST", `/events/${code}/live-ticket`, undefined, playerId)).json;
  const res = await SELF.fetch(`https://bridge.test/api/events/${code}/live?ticket=${ticket}`, {
    headers: { Upgrade: "websocket" },
  });
  expect(res.status).toBe(101);
  const ws = res.webSocket!;
  ws.accept();
  const messages: PushMessage[] = [];
  ws.addEventListener("message", (e) => {
    messages.push(JSON.parse(e.data as string) as PushMessage);
  });
  const waitFor = async (pred: (m: PushMessage) => boolean) => {
    for (let i = 0; i < 100; i++) {
      const hit = messages.find(pred);
      if (hit) return hit;
      await new Promise((r) => setTimeout(r, 10));
    }
    throw new Error(`No matching message; got ${JSON.stringify(messages)}`);
  };
  return { ws, messages, waitFor };
}

// ---- Creating and joining -------------------------------------------------------------------------

describe("creating a game", () => {
  it("returns a join code and the creator's player ID", async () => {
    const res = await api<JoinedResponse>("POST", "/events", { name: "Marc", game, startBoard: 2 });
    expect(res.status).toBe(201);
    expect(res.json.code).toMatch(/^[2-9A-HJKMNP-Z]{8}$/);
    expect(res.json.slot).toBe(1);

    const snap = await api<EventSnapshot>("GET", `/events/${res.json.code}`, undefined, res.json.playerId);
    expect(snap.json.title).toBe("Test fixture (3 boards)");
    expect(snap.json.status).toBe("lobby");
    expect(snap.json.startBoard).toBe(2);
    expect(snap.json.players).toEqual([{ slot: 1, name: "Marc", isCreator: true, isBot: false, seat: null, connected: false }]);
    expect(snap.json.you).toEqual({ slot: 1, isCreator: true, seat: null });
  });

  it("rejects a bad game file, a missing name and a board that isn't in the game", async () => {
    const broken = structuredClone(game);
    broken.boards[0]!.hands.N = "AKQJ.AKQJ.AKQJ.AKQJ";
    expect((await api("POST", "/events", { name: "Marc", game: broken })).status).toBe(400);
    expect((await api("POST", "/events", { name: "  ", game })).status).toBe(400);
    expect((await api("POST", "/events", { name: "Marc", game, startBoard: 99 })).status).toBe(400);
  });

  it("accepts the code in any case, with spaces or dashes", async () => {
    const { code } = (await api<JoinedResponse>("POST", "/events", { name: "Marc", game })).json;
    const typed = `${code.slice(0, 4).toLowerCase()}-${code.slice(4)}`;
    expect((await api("GET", `/events/${typed}`)).status).toBe(200);
  });

  it("returns 404 for an unknown code", async () => {
    expect((await api("GET", "/events/ZZZZZZZZ")).status).toBe(404);
  });

  it("never shows other players' secret IDs", async () => {
    const { code, creator, others } = await lobbyOfFour();
    const text = JSON.stringify((await api("GET", `/events/${code}`)).json);
    for (const id of [creator.playerId, ...others.map((o) => o.playerId)]) expect(text).not.toContain(id);
  });
});

describe("joining", () => {
  it("takes the next slot, up to 4 players", async () => {
    const { code, others } = await lobbyOfFour();
    expect(others.map((o) => o.slot)).toEqual([2, 3, 4]);
    const fifth = await api("POST", `/events/${code}/players`, { name: "Dee" });
    expect(fifth.status).toBe(409);
  });

  it("is closed once play has started", async () => {
    const { code } = await gameInPlay();
    expect((await api("POST", `/events/${code}/players`, { name: "Late" })).status).toBe(409);
  });

  it("leaving the lobby frees the place; the creator leaving cancels the game", async () => {
    const { code, creator, others } = await lobbyOfFour();
    expect((await api("DELETE", `/events/${code}/players/me`, undefined, others[0]!.playerId)).status).toBe(204);
    const rejoin = await api<JoinedResponse>("POST", `/events/${code}/players`, { name: "Ann again" });
    expect(rejoin.json.slot).toBe(2);
    expect((await api("DELETE", `/events/${code}/players/me`, undefined, creator.playerId)).status).toBe(204);
    expect((await api("GET", `/events/${code}`)).status).toBe(404);
  });
});

// ---- Starting play -------------------------------------------------------------------------------

describe("partnerships and seats", () => {
  it("only the creator chooses, and only with 4 players", async () => {
    const created = (await api<JoinedResponse>("POST", "/events", { name: "Marc", game })).json;
    const early = await api("POST", `/events/${created.code}/partnerships`, { random: true }, created.playerId);
    expect(early.status).toBe(409);

    const { code, others } = await lobbyOfFour();
    const notCreator = await api("POST", `/events/${code}/partnerships`, { random: true }, others[0]!.playerId);
    expect(notCreator.status).toBe(403);
  });

  it("seats partners opposite each other and starts play", async () => {
    const { code, creator } = await gameInPlay();
    const snap = (await api<EventSnapshot>("GET", `/events/${code}`, undefined, creator.playerId)).json;
    expect(snap.status).toBe("playing");
    const seatOf = (slot: number) => snap.players.find((p) => p.slot === slot)!.seat!;
    expect(new Set(snap.players.map((p) => p.seat))).toEqual(new Set(["N", "E", "S", "W"]));
    const opposite = { N: "S", S: "N", E: "W", W: "E" } as const;
    expect(opposite[seatOf(1)]).toBe(seatOf(2)); // Marc and his chosen partner Ann
    expect(opposite[seatOf(3)]).toBe(seatOf(4));
  });

  it("random partnerships still seat partners opposite", () => {
    for (let i = 0; i < 50; i++) {
      const seats = assignSeats([1, 2, 3, 4], 1, "random");
      const partner = [2, 3, 4].find((s) => {
        const a = seats.get(1)!;
        const b = seats.get(s)!;
        return (a === "N" && b === "S") || (a === "S" && b === "N") || (a === "E" && b === "W") || (a === "W" && b === "E");
      });
      expect(partner).toBeDefined();
    }
  });
});

// ---- Results ------------------------------------------------------------------------------------

describe("results", () => {
  it("any player can save, and anyone at the table can correct it", async () => {
    const { code, creator, others } = await gameInPlay();
    const first = await api<ResultDto>("PUT", `/events/${code}/boards/1`, { contract: "4s", declarer: "S", tricks: 10 }, creator.playerId);
    expect(first.status).toBe(200);
    expect(first.json).toMatchObject({ board: 1, contract: "4S", declarer: "S", tricks: 10, enteredBy: 1 });

    const fix = await api<ResultDto>("PUT", `/events/${code}/boards/1`, { contract: "4SX", declarer: "S", tricks: 9 }, others[1]!.playerId);
    expect(fix.json).toMatchObject({ contract: "4SX", tricks: 9, enteredBy: 3 });

    const snap = (await api<EventSnapshot>("GET", `/events/${code}`)).json;
    expect(snap.results).toHaveLength(1);
    expect(snap.results[0]).toMatchObject({ contract: "4SX", tricks: 9 });
  });

  it("takes the contract first, then the tricks", async () => {
    const { code, creator, others } = await gameInPlay();
    const put = (body: unknown, id = creator.playerId) => api<ResultDto>("PUT", `/events/${code}/boards/1`, body, id);

    const bid = await put({ contract: "3nt", declarer: "W", tricks: null }, others[0]!.playerId);
    expect(bid.status).toBe(200);
    expect(bid.json).toMatchObject({ contract: "3NT", declarer: "W", tricks: null, enteredBy: 2 });
    expect((await put({ contract: "3NT", declarer: null, tricks: null })).status).toBe(400);

    const played = await put({ contract: "3NT", declarer: "W", tricks: 8 });
    expect(played.json).toMatchObject({ contract: "3NT", tricks: 8, enteredBy: 1 });

    // Passed out has no play, so it's complete even when sent as a contract only.
    const passed = await api<ResultDto>("PUT", `/events/${code}/boards/2`, { contract: "PASS", declarer: null, tricks: null }, creator.playerId);
    expect(passed.json).toMatchObject({ contract: "PASS", tricks: 0 });
  });

  it("validates contracts, tricks, boards and who's asking", async () => {
    const { code, creator } = await gameInPlay();
    const put = (b: number, body: unknown, id = creator.playerId) => api("PUT", `/events/${code}/boards/${b}`, body, id);
    expect((await put(1, { contract: "9Z", declarer: "N", tricks: 9 })).status).toBe(400);
    expect((await put(1, { contract: "3NT", declarer: "N", tricks: 14 })).status).toBe(400);
    expect((await put(1, { contract: "3NT", declarer: null, tricks: 9 })).status).toBe(400);
    expect((await put(99, { contract: "3NT", declarer: "N", tricks: 9 })).status).toBe(404);
    expect((await put(1, { contract: "3NT", declarer: "N", tricks: 9 }, "not-a-player")).status).toBe(403);
    expect((await put(1, { contract: "PASS", declarer: null, tricks: 0 })).status).toBe(200);
  });

  it("can't be entered before play starts", async () => {
    const { code, creator } = await lobbyOfFour();
    const res = await api("PUT", `/events/${code}/boards/1`, { contract: "3NT", declarer: "N", tricks: 9 }, creator.playerId);
    expect(res.status).toBe(409);
  });

  it("results?since= returns only what changed", async () => {
    const { code, creator } = await gameInPlay();
    await api("PUT", `/events/${code}/boards/1`, { contract: "1NT", declarer: "N", tricks: 7 }, creator.playerId);
    const { now } = (await api<EventSnapshot>("GET", `/events/${code}`)).json;
    await new Promise((r) => setTimeout(r, 5));
    await api("PUT", `/events/${code}/boards/2`, { contract: "2H", declarer: "E", tricks: 8 }, creator.playerId);
    const since = await api<{ results: ResultDto[] }>("GET", `/events/${code}/results?since=${encodeURIComponent(now)}`, undefined, creator.playerId);
    expect(since.json.results.map((r) => r.board)).toEqual([2]);
  });
});

// ---- Playing the cards on devices -----------------------------------------------------------------

describe("playing the cards on devices", () => {
  const b1 = game.boards[0]!;
  const hands = Object.fromEntries(Object.entries(b1.hands).map(([s, h]) => [s, parseHand(h)])) as Record<Seat, ReturnType<typeof parseHand>>;

  /** A game in play with 3NT by South entered on board 1, and each seat's player ID. */
  async function contractIn() {
    const g = await gameInPlay();
    await api("PUT", `/events/${g.code}/boards/1`, { contract: "3NT", declarer: "S", tricks: null }, g.creator.playerId);
    const snap = (await api<EventSnapshot>("GET", `/events/${g.code}`)).json;
    const ids = [g.creator, ...g.others];
    const idOf = Object.fromEntries(snap.players.map((p) => [p.seat, ids.find((j) => j.slot === p.slot)!.playerId])) as Record<Seat, string>;
    return { ...g, idOf };
  }
  const start = (code: string, id: string) => api<ResultDto>("POST", `/events/${code}/boards/1/play`, {}, id);
  const play = (code: string, seq: number, card: string, id: string) =>
    api<PlayDto>("POST", `/events/${code}/boards/1/cards`, { seq, card }, id);

  it("only the creator starts it, and only once the contract is in", async () => {
    const g = await gameInPlay();
    expect((await start(g.code, g.creator.playerId)).status).toBe(409);
    await api("PUT", `/events/${g.code}/boards/1`, { contract: "3NT", declarer: "S", tricks: null }, g.creator.playerId);
    expect((await start(g.code, g.others[0]!.playerId)).status).toBe(403);
    const started = await start(g.code, g.creator.playerId);
    expect(started.status).toBe(200);
    expect(started.json).toMatchObject({ board: 1, contract: "3NT", tricks: null, onDevices: true });
  });

  it("takes cards in turn, following suit, with declarer playing dummy's", async () => {
    const { code, creator, idOf } = await contractIn();
    await start(code, creator.playerId);
    // West leads. Nobody else can, and West must send the right card number.
    expect((await play(code, 1, "HK", idOf.N)).status).toBe(409);
    expect((await play(code, 2, "HK", idOf.W)).status).toBe(409);
    expect((await play(code, 1, "ZZ", idOf.W)).status).toBe(400);
    expect((await play(code, 1, "SA", idOf.W)).status).toBe(400); // not West's card
    expect((await play(code, 1, "HK", idOf.W)).json).toEqual({ board: 1, seq: 1, seat: "W", card: "HK" });
    expect((await play(code, 1, "HK", idOf.W)).status).toBe(409); // a second tap
    // North is dummy: South plays its cards, North can't, and North must follow in hearts.
    expect((await play(code, 2, "HA", idOf.N)).status).toBe(409);
    expect((await play(code, 2, "CA", idOf.S)).status).toBe(400);
    expect((await play(code, 2, "HA", idOf.S)).json).toMatchObject({ seat: "N", card: "HA" });

    const snap = (await api<EventSnapshot>("GET", `/events/${code}`)).json;
    expect(snap.plays.map((p) => p.card)).toEqual(["HK", "HA"]);
  });

  it("saves the result after the last card", async () => {
    const { code, creator, idOf } = await contractIn();
    await start(code, creator.playerId);
    let state = replay(hands, "NT", "S", []);
    for (let seq = 1; !isComplete(state); seq++) {
      const seat = toPlay(state);
      const card = chooseCard(state, () => 0.5);
      const res = await play(code, seq, cardCode(card), idOf[seat === dummyOf("S") ? "S" : seat]);
      expect(res.status).toBe(200);
      state = playCard(state, parseCard(res.json.card)!);
    }
    const snap = (await api<EventSnapshot>("GET", `/events/${code}`)).json;
    const tricks = tricksWon(state).declarer;
    expect(snap.results[0]).toMatchObject({ contract: "3NT", declarer: "S", tricks, onDevices: true });
    expect(snap.plays).toEqual([]); // finished boards' cards aren't sent
    expect((await play(code, 53, "SA", idOf.W)).status).toBe(409);
  }, 30_000); // 52 requests

  it("plays one board at a time", async () => {
    const { code, creator } = await contractIn();
    await start(code, creator.playerId);
    await api("PUT", `/events/${code}/boards/2`, { contract: "2H", declarer: "E", tricks: null }, creator.playerId);
    const second = await api("POST", `/events/${code}/boards/2/play`, {}, creator.playerId);
    expect(second.status).toBe(409);
  });

  it("lets the creator play the bots' cards, and bots accept claims straight away", async () => {
    // Marc (creator) and Ann against two bots.
    const marc = (await api<JoinedResponse>("POST", "/events", { name: "Marc", game, startBoard: 1 })).json;
    const { code } = marc;
    const ann = (await api<JoinedResponse>("POST", `/events/${code}/players`, { name: "Ann" })).json;
    await api("POST", `/events/${code}/test-players`);
    await api("POST", `/events/${code}/partnerships`, { partnerSlot: 2 }, marc.playerId);
    let snap = (await api<EventSnapshot>("GET", `/events/${code}`)).json;
    expect(snap.players.map((p) => p.isBot)).toEqual([false, false, true, true]);
    const marcSeat = snap.players[0]!.seat!;

    // Marc declares, so his left-hand opponent (a bot) leads.
    await api("PUT", `/events/${code}/boards/1`, { contract: "3NT", declarer: marcSeat, tricks: null }, marc.playerId);
    await start(code, marc.playerId);
    const state = replay(hands, "NT", marcSeat, []);
    const lead = cardCode(chooseCard(state, () => 0.5));
    expect((await play(code, 1, lead, ann.playerId)).status).toBe(409); // only the creator plays for bots
    expect((await play(code, 1, lead, marc.playerId)).json).toMatchObject({ seat: toPlay(state), card: lead });

    // Marc claims the 13 tricks left (none taken yet): the bots accept, and that's the result.
    const made = await api<ClaimDto>("POST", `/events/${code}/boards/1/claim`, { tricks: 13 }, marc.playerId);
    expect(made.json.acceptedBy).toHaveLength(2);
    snap = (await api<EventSnapshot>("GET", `/events/${code}`)).json;
    expect(snap.results[0]).toMatchObject({ tricks: 13, onDevices: true, enteredBy: marc.slot });
    expect(snap.claims).toEqual([]);
  });

  describe("claims", () => {
    const claim = (code: string, tricks: number, id: string) => api<ClaimDto>("POST", `/events/${code}/boards/1/claim`, { tricks }, id);
    const answer = (code: string, accept: boolean, id: string) =>
      api<ClaimDto | null>("POST", `/events/${code}/boards/1/claim/answer`, { accept }, id);
    const withdraw = (code: string, id: string) => api("DELETE", `/events/${code}/boards/1/claim`, undefined, id);
    const claimsNow = async (code: string) => (await api<EventSnapshot>("GET", `/events/${code}`)).json.claims;

    it("stops play until both defenders answer declarer's claim; one refusal ends it", async () => {
      const { code, creator, idOf } = await contractIn();
      await start(code, creator.playerId);
      await play(code, 1, "HK", idOf.W);
      expect((await claim(code, 14, idOf.S)).status).toBe(400); // only 13 left
      expect((await claim(code, 9, idOf.N)).status).toBe(403); // dummy can't
      expect((await claim(code, 9, idOf.S)).json).toEqual({ board: 1, seat: "S", tricks: 9, acceptedBy: [] });
      expect((await claim(code, 9, idOf.W)).status).toBe(409); // one at a time
      expect((await play(code, 2, "HA", idOf.S)).status).toBe(409); // play waits

      expect((await answer(code, true, idOf.N)).status).toBe(403); // declarer's side doesn't answer
      expect((await answer(code, true, idOf.E)).json).toMatchObject({ acceptedBy: ["E"] });
      expect((await answer(code, false, idOf.W)).json).toBeNull();
      expect(await claimsNow(code)).toEqual([]);
      expect((await play(code, 2, "HA", idOf.S)).status).toBe(200); // play goes on
    });

    it("can be taken back by the claimer until it's accepted", async () => {
      const { code, creator, idOf } = await contractIn();
      await start(code, creator.playerId);
      await claim(code, 13, idOf.S);
      expect((await withdraw(code, idOf.E)).status).toBe(403);
      expect((await withdraw(code, idOf.S)).status).toBe(204);
      expect(await claimsNow(code)).toEqual([]);

      await claim(code, 13, idOf.S);
      await answer(code, true, idOf.E);
      expect((await answer(code, true, idOf.W)).json).toMatchObject({ acceptedBy: ["E", "W"] });
      // Accepted: that's the result, and the board is no longer being played.
      const snap = (await api<EventSnapshot>("GET", `/events/${code}`)).json;
      expect(snap.results[0]).toMatchObject({ tricks: 13, onDevices: true });
      expect(snap.claims).toEqual([]);
      expect((await withdraw(code, idOf.S)).status).toBe(409);
      expect((await answer(code, false, idOf.E)).status).toBe(409);
      expect((await play(code, 1, "HK", idOf.W)).status).toBe(409); // the hand is over
    });

    it("is answered by declarer alone when a defender claims", async () => {
      const { code, creator, idOf } = await contractIn();
      await start(code, creator.playerId);
      await claim(code, 4, idOf.E);
      expect((await answer(code, true, idOf.N)).status).toBe(403); // dummy
      expect((await answer(code, true, idOf.S)).json).toMatchObject({ acceptedBy: ["S"] });
    });

    it("is pushed to everyone", async () => {
      const { code, creator, others, idOf } = await contractIn();
      const ann = await connect(code, others[0]!.playerId);
      await start(code, creator.playerId);
      await claim(code, 13, idOf.S);
      expect(await ann.waitFor((m) => m.type === "claim")).toMatchObject({ type: "claim", board: 1, claim: { seat: "S", tricks: 13 } });
      ann.ws.close();
    });
  });

  it("keeps the contract while the cards are played; a full result ends it", async () => {
    const { code, creator, idOf } = await contractIn();
    await start(code, creator.playerId);
    await play(code, 1, "HK", idOf.W);
    const put = (body: unknown) => api<ResultDto>("PUT", `/events/${code}/boards/1`, body, creator.playerId);
    expect((await put({ contract: "4S", declarer: "S", tricks: null })).status).toBe(409);

    expect((await put({ contract: "3NT", declarer: "S", tricks: 9 })).json).toMatchObject({ tricks: 9, onDevices: true });
    expect((await play(code, 1, "HK", idOf.W)).status).toBe(409); // finished
  });

  it("pushes each card to everyone", async () => {
    const { code, creator, others, idOf } = await contractIn();
    const ann = await connect(code, others[0]!.playerId);
    await start(code, creator.playerId);
    await ann.waitFor((m) => m.type === "result" && m.result.onDevices);
    await play(code, 1, "HK", idOf.W);
    expect(await ann.waitFor((m) => m.type === "play")).toEqual({ type: "play", play: { board: 1, seq: 1, seat: "W", card: "HK" } });
    ann.ws.close();
  });
});

// ---- Live updates -------------------------------------------------------------------------------

describe("live updates", () => {
  it("pushes saved results and presence to every connected player", async () => {
    const { code, creator, others } = await gameInPlay();
    const ann = await connect(code, others[0]!.playerId);
    const bob = await connect(code, others[1]!.playerId);
    await bob.waitFor((m) => m.type === "presence" && m.connected.includes(2) && m.connected.includes(3));

    await api("PUT", `/events/${code}/boards/3`, { contract: "3NT", declarer: "W", tricks: 9 }, creator.playerId);
    for (const p of [ann, bob]) {
      const msg = await p.waitFor((m) => m.type === "result");
      expect(msg).toMatchObject({ type: "result", result: { board: 3, contract: "3NT", enteredBy: 1 } });
    }

    const snap = (await api<EventSnapshot>("GET", `/events/${code}`)).json;
    expect(snap.players.filter((p) => p.connected).map((p) => p.slot)).toEqual([2, 3]);

    ann.ws.close();
    await bob.waitFor((m) => m.type === "presence" && !m.connected.includes(2));
    bob.ws.close();
  });

  it("refuses a connection without a valid, unused pass", async () => {
    const { code, creator } = await gameInPlay();
    expect((await api("POST", `/events/${code}/live-ticket`, undefined, "not-a-player")).status).toBe(403);
    const open = (ticket: string) =>
      SELF.fetch(`https://bridge.test/api/events/${code}/live?ticket=${ticket}`, { headers: { Upgrade: "websocket" } });
    expect((await open("made-up")).status).toBe(403);

    const { ticket } = (await api<LiveTicketResponse>("POST", `/events/${code}/live-ticket`, undefined, creator.playerId)).json;
    const first = await open(ticket);
    expect(first.status).toBe(101);
    first.webSocket!.accept();
    expect((await open(ticket)).status).toBe(403); // single use
    first.webSocket!.close();
  });

  it("tells everyone when the game ends", async () => {
    const { code, others } = await gameInPlay();
    const ann = await connect(code, others[0]!.playerId);
    expect((await api("POST", `/events/${code}/end`, undefined, others[2]!.playerId)).status).toBe(204);
    await ann.waitFor((m) => m.type === "status" && m.status === "ended");
    ann.ws.close();
  });
});

// ---- Seat requests ---------------------------------------------------------------------------------

describe("seat requests", () => {
  async function ask(code: string, name: string, slot: number) {
    return api<SeatRequestCreated>("POST", `/events/${code}/requests`, { name, slot });
  }
  const status = async (code: string, r: SeatRequestCreated) =>
    (await api<SeatRequestState>("GET", `/events/${code}/requests/${r.requestId}`, undefined, r.playerId)).json.status;

  it("hands the seat over when someone at the table allows it", async () => {
    const { code, others } = await gameInPlay();
    const ann = await connect(code, others[0]!.playerId);
    const bob = await connect(code, others[1]!.playerId); // Bob (slot 3) is being replaced
    await bob.waitFor((m) => m.type === "presence" && m.connected.includes(2) && m.connected.includes(3));

    const asked = await ask(code, "Dana", 3);
    expect(asked.status).toBe(201);
    expect(asked.json.anyoneConnected).toBe(true);
    const dana = asked.json;
    await ann.waitFor((m) => m.type === "request" && m.request.name === "Dana" && m.request.slot === 3);
    expect(await status(code, dana)).toBe("pending");
    // Players see it in the snapshot too (for anyone who connects later); outsiders don't.
    expect((await api<EventSnapshot>("GET", `/events/${code}`, undefined, others[0]!.playerId)).json.requests).toHaveLength(1);
    expect((await api<EventSnapshot>("GET", `/events/${code}`)).json.requests).toEqual([]);

    expect((await api("POST", `/events/${code}/requests/${dana.requestId}/answer`, { allow: true }, others[0]!.playerId)).status).toBe(204);
    expect(await status(code, dana)).toBe("allowed");

    // Dana now holds the seat; Bob's key no longer works, and his device was told and cut off.
    const asDana = (await api<EventSnapshot>("GET", `/events/${code}`, undefined, dana.playerId)).json;
    expect(asDana.you).toMatchObject({ slot: 3 });
    expect(asDana.players.find((p) => p.slot === 3)?.name).toBe("Dana");
    expect((await api<EventSnapshot>("GET", `/events/${code}`, undefined, others[1]!.playerId)).json.you).toBeNull();
    expect((await api("POST", `/events/${code}/live-ticket`, undefined, others[1]!.playerId)).status).toBe(403);
    const news = await bob.waitFor((m) => m.type === "requestClosed");
    expect(news).toMatchObject({ outcome: "allowed", by: 2, replacedName: "Bob", request: { name: "Dana", slot: 3 } });
    await ann.waitFor((m) => m.type === "presence" && !m.connected.includes(3));
    ann.ws.close();
  });

  it("can be denied or cancelled, and only the first answer counts", async () => {
    const { code, creator, others } = await gameInPlay();
    const answer = (id: string, allow: boolean, who = creator.playerId) =>
      api("POST", `/events/${code}/requests/${id}/answer`, { allow }, who);

    const denied = (await ask(code, "Dana", 4)).json;
    expect((await answer(denied.requestId, false)).status).toBe(204);
    expect(await status(code, denied)).toBe("denied");
    expect((await answer(denied.requestId, true, others[0]!.playerId)).status).toBe(409);

    const cancelled = (await ask(code, "Dana", 4)).json;
    expect((await api("DELETE", `/events/${code}/requests/${cancelled.requestId}`, undefined, cancelled.playerId)).status).toBe(204);
    expect(await status(code, cancelled)).toBe("cancelled");

    // Outsiders can't answer, and allowing one request turns down others for the same seat.
    const first = (await ask(code, "Eve", 4)).json;
    const second = (await ask(code, "Fay", 4)).json;
    expect((await answer(first.requestId, true, "not-a-player")).status).toBe(403);
    expect((await answer(first.requestId, true)).status).toBe(204);
    expect(await status(code, second)).toBe("denied");
  });

  it("is only for full games, and for a real player's seat", async () => {
    const created = (await api<JoinedResponse>("POST", "/events", { name: "Marc", game })).json;
    expect((await ask(created.code, "Dana", 1)).status).toBe(409); // there's room: just join
    const { code } = await lobbyOfFour();
    expect((await ask(code, "Dana", 9)).status).toBe(400);
    expect((await ask(code, "Dana", 2)).status).toBe(201); // a full lobby works too
  });
});

// ---- Nightly clean-up ------------------------------------------------------------------------------

describe("nightly clean-up", () => {
  it("deletes expired games and everything in them, and nothing else", async () => {
    const old = await gameInPlay();
    await api("PUT", `/events/${old.code}/boards/1`, { contract: "3NT", declarer: "N", tricks: 9 }, old.creator.playerId);
    await api("POST", `/events/${old.code}/requests`, { name: "Dana", slot: 2 });
    const current = await gameInPlay();
    await env.DB.prepare("UPDATE events SET expires_at = ? WHERE code = ?").bind("2000-01-01T00:00:00.000Z", old.code).run();

    expect(await cleanUp(env)).toEqual([old.code]);
    const count = async (table: string, code: string) =>
      (await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${table === "events" ? "code" : "event_code"} = ?`)
        .bind(code)
        .first<{ n: number }>())!.n;
    for (const table of ["events", "players", "results", "seat_requests"]) expect(await count(table, old.code)).toBe(0);
    expect(await count("players", current.code)).toBe(4);
    expect(await cleanUp(env)).toEqual([]); // nothing left to do
  });
});

// ---- Ending, deleting, dev helpers ----------------------------------------------------------------

describe("deleting and test players", () => {
  it("only the creator can delete", async () => {
    const { code, creator, others } = await gameInPlay();
    expect((await api("DELETE", `/events/${code}`, undefined, others[0]!.playerId)).status).toBe(403);
    expect((await api("DELETE", `/events/${code}`, undefined, creator.playerId)).status).toBe(204);
    expect((await api("GET", `/events/${code}`)).status).toBe(404);
  });

  it("fills empty places with test players in dev", async () => {
    const { code } = (await api<JoinedResponse>("POST", "/events", { name: "Marc", game })).json;
    const res = await api<{ added: number[] }>("POST", `/events/${code}/test-players`);
    expect(res.json.added).toEqual([2, 3, 4]);
    const snap = (await api<EventSnapshot>("GET", `/events/${code}`)).json;
    expect(snap.players.map((p) => p.name)).toEqual(["Marc", "Bot 2", "Bot 3", "Bot 4"]);
  });

  it("starts a demo game at board 9 with three bots (allowed in the live app too)", async () => {
    const res = await api<JoinedResponse>("POST", "/events/demo", { name: "Marc" });
    expect(res.status).toBe(201);
    const snap = (await api<EventSnapshot>("GET", `/events/${res.json.code}`, undefined, res.json.playerId)).json;
    expect(snap.title).toBe("Demo game (made-up results)");
    expect(snap.startBoard).toBe(9);
    expect(snap.status).toBe("lobby");
    expect(snap.you?.isCreator).toBe(true);
    expect(snap.players.map((p) => p.name)).toEqual(["Marc", "Bot 2", "Bot 3", "Bot 4"]);
  });
});

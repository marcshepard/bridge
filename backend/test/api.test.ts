import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type {
  EventSnapshot,
  JoinedResponse,
  LiveTicketResponse,
  PushMessage,
  ResultDto,
  SeatRequestCreated,
  SeatRequestState,
} from "../src/api-types";
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
    expect(snap.json.players).toEqual([{ slot: 1, name: "Marc", isCreator: true, seat: null, connected: false }]);
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
    expect(snap.players.map((p) => p.name)).toEqual(["Marc", "Test player 2", "Test player 3", "Test player 4"]);
  });
});

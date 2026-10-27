import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { EventSnapshot, JoinedResponse, PushMessage, ResultDto } from "../src/api-types";
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
  const res = await SELF.fetch(`https://bridge.test/api/events/${code}/live?playerId=${playerId}`, {
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

  it("refuses a connection from someone who isn't a player", async () => {
    const { code } = await gameInPlay();
    const res = await SELF.fetch(`https://bridge.test/api/events/${code}/live?playerId=nope`, {
      headers: { Upgrade: "websocket" },
    });
    expect(res.status).toBe(403);
  });

  it("tells everyone when the game ends", async () => {
    const { code, others } = await gameInPlay();
    const ann = await connect(code, others[0]!.playerId);
    expect((await api("POST", `/events/${code}/end`, undefined, others[2]!.playerId)).status).toBe(204);
    await ann.waitFor((m) => m.type === "status" && m.status === "ended");
    ann.ws.close();
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

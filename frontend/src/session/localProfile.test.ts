import { afterEach, describe, expect, it, vi } from "vitest";
import { LocalProfileStore } from "./localProfile";
import { type CurrentGameInfo, type GameHistoryEntry, MAX_HISTORY } from "./store";

const info = (title: string): CurrentGameInfo => ({ title, board: 12, boardCount: 36, others: ["Ann", "Bob", "Carol"], practice: false });

// No localStorage under Node: the profile works from memory, as in a private window.
describe("the current game in the profile", () => {
  afterEach(() => vi.useRealTimers());

  it("remembers when the current game was last on screen, and what it was", () => {
    vi.useFakeTimers({ now: 1_000 });
    const p = new LocalProfileStore();
    p.setCurrentGame("ABC123");
    expect([p.currentGame(), p.currentGameInfo(), p.lastInGameAt()]).toEqual(["ABC123", null, 1_000]);
    vi.setSystemTime(5_000);
    p.noteInGame(info("The Common Game 11/9/26"));
    expect([p.currentGameInfo(), p.lastInGameAt()]).toEqual([info("The Common Game 11/9/26"), 5_000]);
    // The same game again (going back in) keeps what's known.
    p.setCurrentGame("ABC123");
    expect(p.currentGameInfo()?.title).toBe("The Common Game 11/9/26");
  });

  it("starts afresh for a different game, and forgets on leaving", () => {
    const p = new LocalProfileStore();
    p.setCurrentGame("ABC123");
    p.noteInGame(info("Old game"));
    p.setCurrentGame("XYZ789");
    expect(p.currentGameInfo()).toBeNull();
    p.setPlayerId("XYZ789", "secret");
    p.forget("XYZ789");
    expect([p.currentGame(), p.currentGameInfo(), p.lastInGameAt()]).toEqual([null, null, null]);
    // Nothing to note once there's no current game.
    p.noteInGame(info("Gone"));
    expect(p.currentGameInfo()).toBeNull();
  });
});

describe("bot hints", () => {
  it("are off until turned on", () => {
    const p = new LocalProfileStore();
    expect(p.botHints()).toBe(false);
    p.setBotHints(true);
    expect(p.botHints()).toBe(true);
  });
});

describe("game history", () => {
  const entry = (code: string, startedAt: string, net = 10): GameHistoryEntry => ({
    code,
    startedAt,
    title: "Club night",
    direction: "NS",
    net,
    boards: 4,
    partner: { name: "Ann", bot: false },
    opponents: [{ name: "Bob", bot: false }, { name: "Bot", bot: true }],
  });

  it("keeps one entry per game, updated as it goes, newest first", () => {
    const p = new LocalProfileStore();
    p.recordGame(entry("AAA", "2026-11-20T19:00:00Z"));
    p.recordGame(entry("BBB", "2026-11-22T19:00:00Z"));
    p.recordGame(entry("AAA", "2026-11-20T19:00:00Z", 55.5));
    expect(p.gameHistory().map((e) => [e.code, e.net])).toEqual([["BBB", 10], ["AAA", 55.5]]);
  });

  it(`keeps only the ${MAX_HISTORY} most recent, and can be cleared`, () => {
    const p = new LocalProfileStore();
    for (let i = 0; i < MAX_HISTORY + 3; i++) p.recordGame(entry(`G${i}`, new Date(Date.UTC(2026, 0, 1 + i)).toISOString()));
    const kept = p.gameHistory();
    expect(kept).toHaveLength(MAX_HISTORY);
    expect(kept[0]!.code).toBe(`G${MAX_HISTORY + 2}`);
    expect(kept.some((e) => e.code === "G0")).toBe(false);
    p.clearGameHistory();
    expect(p.gameHistory()).toEqual([]);
  });
});

describe("confirm bids", () => {
  it("is on until turned off", () => {
    const p = new LocalProfileStore();
    expect(p.confirmBids()).toBe(true);
    p.setConfirmBids(false);
    expect(p.confirmBids()).toBe(false);
  });
});

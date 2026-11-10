import { afterEach, describe, expect, it, vi } from "vitest";
import { LocalProfileStore } from "./localProfile";
import type { CurrentGameInfo } from "./store";

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

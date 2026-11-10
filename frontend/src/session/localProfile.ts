// Your identity on this device, kept in this browser's localStorage.
//
// Storage can be unavailable (private windows, blocked site data). Then everything still works for
// the visit, from memory; it just isn't remembered after a reload.

import { type SystemSettings, parseSystemSettings } from "../core/bidding/system";
import type { CurrentGameInfo, ProfileStore } from "./store";

interface Profile {
  name: string;
  playerIds: Record<string, string>;
  currentGame: string | null;
  /** What Home says about the current game. */
  currentGameInfo: CurrentGameInfo | null;
  /** When the current game was last on screen (ms since 1970), to decide where the app opens. */
  lastInGameAt: number | null;
  installBannerClosed: boolean;
  /** Practice games in which the bots bid your seat too. */
  botsBidForMe: string[];
  /** Your bidding system; checked on reading, so an old or damaged one falls back to SAYC. */
  biddingSystem: SystemSettings;
}

/** A saved game summary, checked: anything unexpected (an older or damaged profile) is dropped. */
function readInfo(raw: unknown): CurrentGameInfo | null {
  const i = raw as Partial<CurrentGameInfo> | null | undefined;
  if (!i || typeof i.title !== "string" || typeof i.board !== "number" || typeof i.boardCount !== "number") return null;
  const others = Array.isArray(i.others) ? i.others.filter((n): n is string => typeof n === "string") : [];
  return { title: i.title, board: i.board, boardCount: i.boardCount, others, practice: i.practice === true };
}

export class LocalProfileStore implements ProfileStore {
  private readonly key: string;
  private profile: Profile;

  /**
   * `identity` gives a browser tab its own separate profile (dev mode's `?as=2`), so several tabs
   * can act as different players.
   */
  constructor(identity?: string) {
    this.key = identity ? `bridge.profile.v1.as-${identity}` : "bridge.profile.v1";
    this.profile = this.read();
  }

  private read(): Profile {
    try {
      const raw = localStorage.getItem(this.key);
      if (raw) {
        const p = JSON.parse(raw) as Partial<Profile>;
        return {
          name: p.name ?? "",
          playerIds: p.playerIds ?? {},
          currentGame: p.currentGame ?? null,
          currentGameInfo: readInfo(p.currentGameInfo),
          lastInGameAt: p.lastInGameAt ?? null,
          installBannerClosed: p.installBannerClosed ?? false,
          botsBidForMe: p.botsBidForMe ?? [],
          biddingSystem: parseSystemSettings(p.biddingSystem),
        };
      }
    } catch {
      // Unreadable or unavailable: start fresh.
    }
    return { name: "", playerIds: {}, currentGame: null, currentGameInfo: null, lastInGameAt: null, installBannerClosed: false, botsBidForMe: [], biddingSystem: parseSystemSettings(null) };
  }

  private write(): void {
    try {
      localStorage.setItem(this.key, JSON.stringify(this.profile));
    } catch {
      // Storage unavailable or full: kept in memory for this visit only.
    }
  }

  name(): string {
    return this.profile.name;
  }

  setName(name: string): void {
    this.profile.name = name.trim();
    this.write();
  }

  playerId(code: string): string | null {
    return this.profile.playerIds[code] ?? null;
  }

  setPlayerId(code: string, playerId: string): void {
    this.profile.playerIds[code] = playerId;
    this.write();
  }

  forget(code: string): void {
    delete this.profile.playerIds[code];
    this.profile.botsBidForMe = this.profile.botsBidForMe.filter((c) => c !== code);
    if (this.profile.currentGame === code) this.setCurrentGame(null);
    this.write();
  }

  currentGame(): string | null {
    return this.profile.currentGame;
  }

  setCurrentGame(code: string | null): void {
    if (code !== this.profile.currentGame) {
      // A different game: what we knew about the last one no longer applies.
      this.profile.currentGameInfo = null;
      this.profile.lastInGameAt = code === null ? null : Date.now();
    }
    this.profile.currentGame = code;
    this.write();
  }

  currentGameInfo(): CurrentGameInfo | null {
    return this.profile.currentGameInfo;
  }

  lastInGameAt(): number | null {
    return this.profile.lastInGameAt;
  }

  noteInGame(info: CurrentGameInfo): void {
    if (this.profile.currentGame === null) return;
    this.profile.currentGameInfo = info;
    this.profile.lastInGameAt = Date.now();
    this.write();
  }

  biddingSystem(): SystemSettings {
    return this.profile.biddingSystem;
  }

  setBiddingSystem(system: SystemSettings): void {
    this.profile.biddingSystem = parseSystemSettings(system);
    this.write();
  }

  botsBidForMe(code: string): boolean {
    return this.profile.botsBidForMe.includes(code);
  }

  setBotsBidForMe(code: string, on: boolean): void {
    this.profile.botsBidForMe = [...this.profile.botsBidForMe.filter((c) => c !== code), ...(on ? [code] : [])];
    this.write();
  }

  installBannerClosed(): boolean {
    return this.profile.installBannerClosed;
  }

  setInstallBannerClosed(): void {
    this.profile.installBannerClosed = true;
    this.write();
  }
}

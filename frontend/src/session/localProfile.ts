// Your identity on this device, kept in this browser's localStorage.
//
// Storage can be unavailable (private windows, blocked site data). Then everything still works for
// the visit, from memory; it just isn't remembered after a reload.

import type { ProfileStore } from "./store";

interface Profile {
  name: string;
  playerIds: Record<string, string>;
  currentGame: string | null;
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
        return { name: p.name ?? "", playerIds: p.playerIds ?? {}, currentGame: p.currentGame ?? null };
      }
    } catch {
      // Unreadable or unavailable: start fresh.
    }
    return { name: "", playerIds: {}, currentGame: null };
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
    if (this.profile.currentGame === code) this.profile.currentGame = null;
    this.write();
  }

  currentGame(): string | null {
    return this.profile.currentGame;
  }

  setCurrentGame(code: string | null): void {
    this.profile.currentGame = code;
    this.write();
  }
}

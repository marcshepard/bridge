// Where sessions (seat, boards played, results entered) are kept.
//
// The app only talks to the `SessionStore` interface, and every method is async, so a future
// backend (shared tally, sign-in) can implement it with HTTP calls without touching the screens.
// Today the only implementation keeps sessions in this browser's localStorage.

import type { Session } from "./session";

export interface SessionStore {
  list(): Promise<Session[]>;
  /** Create or replace a session. */
  save(session: Session): Promise<void>;
  remove(id: string): Promise<void>;
}

const STORAGE_KEY = "bridge.sessions.v1";

export class LocalSessionStore implements SessionStore {
  private read(): Session[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as Session[]) : [];
    } catch {
      return [];
    }
  }

  private write(sessions: Session[]): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
    } catch {
      // Storage unavailable (private window, blocked, full): sessions last for this visit only.
    }
  }

  async list(): Promise<Session[]> {
    return this.read();
  }

  async save(session: Session): Promise<void> {
    this.write([...this.read().filter((s) => s.id !== session.id), session]);
  }

  async remove(id: string): Promise<void> {
    this.write(this.read().filter((s) => s.id !== id));
  }
}

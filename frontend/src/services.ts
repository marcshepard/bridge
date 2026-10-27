// The one place that decides where data comes from and where it goes.
//
// Screens never fetch or store anything directly; they use these services. To move to a backend
// later, add implementations of `GameProvider` / `SessionStore` that call it, and swap them in
// here. Nothing in src/ui needs to change.

import { ImportedProvider } from "./providers/importedProvider";
import { StaticProvider } from "./providers/staticProvider";
import type { GameProvider } from "./providers/types";
import { LocalSessionStore, type SessionStore } from "./session/store";

/** Games you've imported from files on this device. */
export const importedProvider = new ImportedProvider();

/** Every source of games, in the order they're listed when starting a session. */
export const gameProviders: GameProvider[] = [new StaticProvider(), importedProvider];

export const sessionStore: SessionStore = new LocalSessionStore();

export function providerById(id: string): GameProvider {
  const p = gameProviders.find((x) => x.id === id);
  if (!p) throw new Error(`Unknown game source "${id}"`);
  return p;
}

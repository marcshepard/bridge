// The one place that decides where data comes from and where it goes.
//
// Screens never fetch or store anything directly; they use these services. Shared games live on
// the backend; who you are on this device lives in this browser.

import type { DoubleDummySolver } from "./core/doubleDummy";
import { WorkerPoolSolver } from "./dds/workerSolver";
import { ApiGameStore } from "./session/apiGameStore";
import { LocalProfileStore } from "./session/localProfile";
import type { GameStore, ProfileStore } from "./session/store";

/** Dev builds only: tools for trying a 4-player game from one computer. */
export const devMode = import.meta.env.DEV;

/**
 * Dev mode's `?as=2`: this tab gets its own player identity, so four tabs side by side act as four
 * players' devices.
 */
export const devIdentity: string | null = devMode
  ? new URLSearchParams(window.location.search).get("as")
  : null;

export const profile: ProfileStore = new LocalProfileStore(devIdentity ?? undefined);

export const games: GameStore = new ApiGameStore(profile);

/**
 * Double dummy (DDS in WebAssembly), in a pool of Web Workers started when first needed: for the
 * bots' hard calls and for scoring a bidding-only board the game file can't score. Null where the
 * browser has no Web Workers; the bots then use their rules of thumb.
 */
export const doubleDummy: DoubleDummySolver | null = typeof Worker !== "undefined" ? new WorkerPoolSolver() : null;

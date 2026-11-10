// Double dummy: how many tricks a contract makes when all four players see all the cards and play
// perfectly. The solver itself (DDS, in WebAssembly) lives outside core/ (src/dds/), behind this
// interface, so the bidding rules can use it without knowing about Web Workers or WebAssembly.

import type { Hand, Seat, Strain } from "./types";

/** One contract to solve: on this deal, how many tricks does `declarer` take in `strain`? */
export interface DoubleDummyJob {
  hands: Record<Seat, Hand>;
  strain: Strain;
  declarer: Seat;
}

export type DoubleDummyTable = Record<Seat, Record<Strain, number>>;

export interface DoubleDummySolver {
  /** Declarer's tricks for each job, in order. */
  tricks(jobs: DoubleDummyJob[]): Promise<number[]>;
  /** Tricks for every declarer in every strain. */
  table(hands: Record<Seat, Hand>): Promise<DoubleDummyTable>;
}

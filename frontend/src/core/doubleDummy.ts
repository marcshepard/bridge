// Double dummy: how many tricks a contract makes when all four players see all the cards and play
// perfectly. The solver itself (DDS, in WebAssembly) lives outside core/ (src/dds/), behind this
// interface, so the bidding rules can use it without knowing about Web Workers or WebAssembly.

import type { Card } from "./play";
import type { Hand, Seat, Strain } from "./types";

/** One contract to solve: on this deal, how many tricks does `declarer` take in `strain`? */
export interface DoubleDummyJob {
  hands: Record<Seat, Hand>;
  strain: Strain;
  declarer: Seat;
}

export type DoubleDummyTable = Record<Seat, Record<Strain, number>>;

/**
 * A position part-way through the play: the cards each hand still holds (not counting the current
 * trick's), the trumps, who led the current trick, and the cards already in it (0–3).
 */
export interface CardPlayJob {
  hands: Record<Seat, Hand>;
  trump: Strain;
  leader: Seat;
  trick: Card[];
}

/** One legal card for the player to move, and the tricks their side then takes (this trick included). */
export interface CardScore {
  card: Card;
  tricks: number;
}

export interface DoubleDummySolver {
  /** Declarer's tricks for each job, in order. */
  tricks(jobs: DoubleDummyJob[]): Promise<number[]>;
  /** Tricks for every declarer in every strain. */
  table(hands: Record<Seat, Hand>): Promise<DoubleDummyTable>;
  /** For each position, every legal card for the player to move, with its tricks. */
  cards(jobs: CardPlayJob[]): Promise<CardScore[][]>;
}

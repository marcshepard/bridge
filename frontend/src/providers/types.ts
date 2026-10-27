// The provider boundary.
//
// A provider's only job is to supply games: the deals plus the raw field results for each board
// (and any optional extras such as commentary or double-dummy analysis). Providers never score or
// rank anything — all of that happens in src/core, so every data source is scored the same way.
//
// To add a new data source (The Common Game, ACBL Live, a friend's parser...), write a provider or an
// importer that produces a `Game`. Nothing else in the app needs to change.

import type { Hand, Seat, Strain, TableResult, Vulnerability } from "../core/types";

export interface SourceInfo {
  /** e.g. "The Common Game", "Synthetic sample", "Imported PBN". */
  name: string;
  /** Link back to the original game, when there is one. */
  url?: string;
  /** Credit / provenance text shown with the game. */
  attribution?: string;
}

export interface GameSummary {
  id: string;
  title: string;
  /** ISO date (YYYY-MM-DD) the game was originally played, if known. */
  date?: string;
  session?: string;
  source: SourceInfo;
  boardCount: number;
}

/**
 * One line of a board's traveller: a result some table got, and how many tables got it.
 *
 * Some sources (The Common Game's results pages) give only the N/S score, not the contract. Those
 * are "score-only" results: `result` is null and `nsScore` holds the score. Otherwise `nsScore` is
 * absent and the score is worked out from `result` by the rules in core/.
 */
export interface FieldResult {
  result: TableResult | null;
  nsScore?: number;
  count: number;
  /** Optional sub-field label, e.g. "Open" or "299er", for sources that split the field. */
  stratum?: string;
}

export interface DoubleDummy {
  /**
   * Tricks each seat takes as declarer in each strain, with perfect play by everyone. Absent when
   * the source gives only the par score.
   */
  tricks?: Record<Seat, Record<Strain, number>>;
  par?: {
    /** Par score from North–South's point of view. */
    nsScore: number;
    contracts: TableResult[];
  };
}

export interface Board {
  number: number;
  dealer: Seat;
  vul: Vulnerability;
  hands: Record<Seat, Hand>;
  field: FieldResult[];
  doubleDummy?: DoubleDummy;
  /** Expert commentary, when the source provides it. Plain text. */
  commentary?: string;
}

export interface Game {
  summary: GameSummary;
  /** Sorted by board number. */
  boards: Board[];
  /** Non-fatal problems found while loading (e.g. a field score that didn't match its contract). */
  warnings: string[];
}

export interface GameProvider {
  /** Stable id, e.g. "static", "imported". */
  readonly id: string;
  readonly name: string;
  listGames(): Promise<GameSummary[]>;
  getGame(gameId: string): Promise<Game>;
}

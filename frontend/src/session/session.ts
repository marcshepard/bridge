// A session: one sitting at the table, playing some boards of one game from one seat.
//
// The results come from the shared game, and every player's device works out the same scores from
// the same results, using core/.

import { compareBoard, scoreField, type BoardComparison } from "../core/compare";
import { contractCode, parseContract, tableResult } from "../core/contract";
import { type Contract, type Seat, type TableResult, directionOf } from "../core/types";
import type { Game } from "../providers/types";

export interface StoredResult {
  contract: string; // "4S", "3NTX", "PASS"
  declarer: Seat | null;
  tricks: number;
}

export interface Session {
  gameId: string;
  gameTitle: string;
  seat: Seat;
  /** Boards in the order they'll be played: from the starting board, wrapping around. */
  boardOrder: number[];
  results: Record<number, StoredResult>;
}

/** Board numbers starting at `start`, wrapping round to cover every board once. */
export function boardOrderFrom(boardNumbers: number[], start: number): number[] {
  const sorted = [...boardNumbers].sort((a, b) => a - b);
  const i = Math.max(0, sorted.indexOf(start));
  return [...sorted.slice(i), ...sorted.slice(0, i)];
}

export function newSession(game: Game, seat: Seat, startBoard: number): Session {
  return {
    gameId: game.summary.id,
    gameTitle: game.summary.title,
    seat,
    boardOrder: boardOrderFrom(
      game.boards.map((b) => b.number),
      startBoard,
    ),
    results: {},
  };
}

/** A board's entry in the shared game: a full result, or just the contract (`tricks: null`) mid-play. */
export type SharedEntry = { board: number; contract: string; declarer: Seat | null; tricks: number | null };

/**
 * Your view of a shared game: your seat, the table's play order, and the results the table has
 * entered so far (one per board, whoever entered it). A board with only its contract isn't done yet.
 */
export function sessionFromShared(game: Game, seat: Seat, startBoard: number, results: SharedEntry[]): Session {
  const s = newSession(game, seat, startBoard);
  for (const r of results) {
    if (r.tricks !== null) s.results[r.board] = { contract: r.contract, declarer: r.declarer, tricks: r.tricks };
  }
  return s;
}

/** The contract the table is playing on a board, once it's entered and before the result is. */
export function pendingContract(results: SharedEntry[], board: number): { contract: Contract; declarer: Seat } | null {
  const r = results.find((x) => x.board === board);
  if (!r || r.tricks !== null || !r.declarer) return null;
  const contract = parseContract(r.contract);
  return contract ? { contract, declarer: r.declarer } : null;
}

/**
 * Boards whose finished result someone else has just changed: in `next` but different in `prev`,
 * where `prev` already had the tricks. Entering a result for the first time isn't a correction (it
 * shows on the board itself); a correction can change a board you've moved on from, and your tally.
 */
export function corrections<T extends SharedEntry & { enteredBy: number; updatedAt: string }>(
  prev: T[],
  next: T[],
  mySlot: number | null,
): T[] {
  return next.filter((r) => {
    const before = prev.find((p) => p.board === r.board);
    return before !== undefined && before.tricks !== null && before.updatedAt !== r.updatedAt && r.enteredBy !== mySlot;
  });
}

export function toStored(r: TableResult): StoredResult {
  return { contract: contractCode(r.contract), declarer: r.declarer, tricks: r.tricks };
}

export function fromStored(r: StoredResult): TableResult {
  return tableResult(r.contract, r.declarer, r.tricks);
}

/** The first board in play order that has no result yet (or null when all are done). */
export function nextUnplayed(session: Session): number | null {
  return session.boardOrder.find((n) => !session.results[n]) ?? null;
}

export interface TallyRow {
  board: number;
  comparison: BoardComparison;
}

export interface Tally {
  rows: TallyRow[];
  played: number;
  /** Average MP% over boards that had a field to compare with. */
  averagePct: number | null;
  /**
   * Sum over boards of each board's net (our MP% − their MP%, rounded to a whole number as shown):
   * 83% on a board is 83 − 17 = +66. Rounding each board first means the total is exactly the sum
   * of the nets on screen.
   */
  margin: number;
  totalImps: number;
}

/**
 * Our matchpoint % minus theirs on one board. Theirs is 100 − ours, so this is 2 × ours − 100:
 * positive when we beat the average, negative when we didn't.
 */
export function marginFor(pct: number | null): number {
  return pct === null ? 0 : 2 * pct - 100;
}

export function compareSessionBoard(session: Session, game: Game, boardNumber: number): BoardComparison | null {
  const stored = session.results[boardNumber];
  const board = game.boards.find((b) => b.number === boardNumber);
  if (!stored || !board) return null;
  return compareBoard(
    fromStored(stored),
    directionOf(session.seat),
    board.vul,
    scoreField(board.field, board.vul),
  );
}

/** Running tally, in play order. */
export function tally(session: Session, game: Game): Tally {
  const rows: TallyRow[] = [];
  for (const n of session.boardOrder) {
    const comparison = compareSessionBoard(session, game, n);
    if (comparison) rows.push({ board: n, comparison });
  }
  const scored = rows.filter((r) => r.comparison.mpPct !== null);
  return {
    rows,
    played: rows.length,
    averagePct: scored.length
      ? scored.reduce((s, r) => s + r.comparison.mpPct!, 0) / scored.length
      : null,
    margin: rows.reduce((s, r) => s + Math.round(marginFor(r.comparison.mpPct)), 0),
    totalImps: rows.reduce((s, r) => s + r.comparison.impsVsDatum, 0),
  };
}

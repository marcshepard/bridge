// The app's own game file format ("schema version 1"), and conversion to the in-app `Game` model.
//
// This is the normalised format every source is converted into. It is deliberately close to what
// a traveller sheet shows, so a parser for any other source only has to emit this JSON.
// See docs/DESIGN.md for a full example.

import { parseContract, parseSeat, tableResult } from "../core/contract";
import { assertValidDeal, parseHand } from "../core/deal";
import { scoreResult } from "../core/scoring";
import {
  type Hand,
  type Seat,
  type Strain,
  type Vulnerability,
  SEATS,
  STRAINS,
} from "../core/types";
import type { Board, DoubleDummy, FieldResult, Game, GameSummary } from "./types";

export interface GameFileV1 {
  schemaVersion: 1;
  id: string;
  title?: string;
  date?: string;
  session?: string;
  source?: { name?: string; url?: string; attribution?: string };
  boards: BoardFileV1[];
}

export interface BoardFileV1 {
  number: number;
  dealer: string; // "N" | "E" | "S" | "W"
  vul: string; // "None" | "NS" | "EW" | "Both" (also accepts "All", "Love", "-")
  /** Hands by seat in "S.H.D.C" form, e.g. "AKQ2.JT9.876.543". */
  hands: Record<string, string>;
  field?: FieldResultFileV1[];
  doubleDummy?: {
    /** Optional when the source gives only the par score. */
    tricks?: Record<string, Record<string, number>>;
    par?: { nsScore: number; contracts?: Array<{ contract: string; declarer: string; tricks: number }> };
  };
  commentary?: string;
}

export interface FieldResultFileV1 {
  /**
   * "4S", "3NTX", "PASS". Leave it out for a score-only result (the source gave the N/S score but
   * not the contract); `nsScore` is then required.
   */
  contract?: string;
  declarer?: string | null;
  tricks?: number | null;
  /** With a contract: optional, and checked against the rules. Without one: the table's N/S score. */
  nsScore?: number;
  count?: number;
  stratum?: string;
}

export function parseVulnerability(text: string): Vulnerability {
  const t = text.trim().toUpperCase();
  if (t === "NONE" || t === "LOVE" || t === "-" || t === "") return "None";
  if (t === "NS" || t === "N-S") return "NS";
  if (t === "EW" || t === "E-W") return "EW";
  if (t === "BOTH" || t === "ALL") return "Both";
  throw new Error(`Unrecognised vulnerability "${text}"`);
}

function parseBoard(b: BoardFileV1, warnings: string[]): Board {
  const where = `Board ${b.number}`;
  if (!Number.isInteger(b.number) || b.number < 1) throw new Error(`Bad board number "${b.number}"`);

  const hands = {} as Record<Seat, Hand>;
  for (const seat of SEATS) {
    const h = b.hands?.[seat];
    if (typeof h !== "string") throw new Error(`${where}: missing hand for ${seat}`);
    hands[seat] = parseHand(h);
  }
  try {
    assertValidDeal(hands);
  } catch (e) {
    throw new Error(`${where}: ${(e as Error).message}`);
  }

  const vul = parseVulnerability(b.vul);
  const field: FieldResult[] = [];
  for (const [i, f] of (b.field ?? []).entries()) {
    try {
      const count = f.count ?? 1;
      if (!Number.isInteger(count) || count < 1) throw new Error(`bad count "${f.count}"`);
      if (f.contract == null || f.contract === "") {
        // Score-only: duplicate scores are always whole tens.
        if (typeof f.nsScore !== "number" || !Number.isInteger(f.nsScore / 10)) {
          throw new Error(`no contract and no usable score ("${String(f.nsScore)}")`);
        }
        field.push({ result: null, nsScore: f.nsScore, count, ...(f.stratum ? { stratum: f.stratum } : {}) });
        continue;
      }
      const result = tableResult(f.contract, f.declarer, f.tricks);
      if (f.nsScore != null) {
        const computed = scoreResult(result, vul).nsScore;
        if (computed !== f.nsScore) {
          warnings.push(
            `${where}, field result ${i + 1} (${f.contract} by ${f.declarer}): file says ${f.nsScore}, rules give ${computed}. Using ${computed}.`,
          );
        }
      }
      field.push({ result, count, ...(f.stratum ? { stratum: f.stratum } : {}) });
    } catch (e) {
      // One bad traveller line shouldn't lose the whole game.
      warnings.push(`${where}, field result ${i + 1} skipped: ${(e as Error).message}`);
    }
  }

  const board: Board = { number: b.number, dealer: parseSeat(b.dealer), vul, hands, field };
  if (b.doubleDummy) board.doubleDummy = parseDoubleDummy(b.doubleDummy, where);
  if (b.commentary) board.commentary = b.commentary;
  return board;
}

function parseDoubleDummy(dd: NonNullable<BoardFileV1["doubleDummy"]>, where: string): DoubleDummy {
  const out: DoubleDummy = {};
  if (dd.tricks) {
    const tricks = {} as Record<Seat, Record<Strain, number>>;
    for (const seat of SEATS) {
      tricks[seat] = {} as Record<Strain, number>;
      for (const strain of STRAINS) {
        const n = dd.tricks[seat]?.[strain];
        if (typeof n !== "number" || n < 0 || n > 13) {
          throw new Error(`${where}: double-dummy tricks missing for ${seat} ${strain}`);
        }
        tricks[seat][strain] = n;
      }
    }
    out.tricks = tricks;
  }
  if (dd.par) {
    out.par = {
      nsScore: dd.par.nsScore,
      contracts: (dd.par.contracts ?? []).map((c) => {
        parseContract(c.contract);
        return tableResult(c.contract, c.declarer, c.tricks);
      }),
    };
  }
  return out;
}

/** Parse and validate a game file (already JSON-decoded). Throws with a readable message if unusable. */
export function parseGameFile(data: unknown): Game {
  const f = data as GameFileV1;
  if (!f || typeof f !== "object") throw new Error("Not a game file");
  if (f.schemaVersion !== 1) throw new Error(`Unsupported schemaVersion "${String(f.schemaVersion)}" (expected 1)`);
  if (!f.id) throw new Error("Game file has no id");
  if (!Array.isArray(f.boards) || f.boards.length === 0) throw new Error("Game file has no boards");

  const warnings: string[] = [];
  const boards = f.boards.map((b) => parseBoard(b, warnings)).sort((a, b) => a.number - b.number);
  const dupes = boards.filter((b, i) => i > 0 && b.number === boards[i - 1]!.number);
  if (dupes.length) throw new Error(`Board ${dupes[0]!.number} appears more than once`);

  const summary: GameSummary = {
    id: f.id,
    title: f.title ?? f.id,
    source: { name: f.source?.name ?? "Unknown source" },
    boardCount: boards.length,
  };
  if (f.date) summary.date = f.date;
  if (f.session) summary.session = f.session;
  if (f.source?.url) summary.source.url = f.source.url;
  if (f.source?.attribution) summary.source.attribution = f.source.attribution;

  return { summary, boards, warnings };
}

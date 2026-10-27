// Importer: PBN (Portable Bridge Notation) → our game file format.
//
// PBN is what most hand-record files are (ACBL Live for Clubs, Bridgemate, BridgeComposer, TCG
// hand records). What we read:
//
//   [Board "5"] [Dealer "N"] [Vulnerable "NS"] [Deal "N:AKQ2.JT9.876.543 ..."]   the deal
//   [Event "..."] [Date "2021.12.03"]                                             game title/date
//   [ScoreTable "Contract\4L;Declarer\1R;Result\2R;Score_NS\6R"] + rows          the traveller
//   [Contract "4S"] [Declarer "N"] [Result "10"]                                  one table's result
//   [DoubleDummyTricks "..."] [OptimumScore "NS 420"]                             BridgeComposer extras
//   { text in braces }                                                             commentary
//
// A file may repeat the same board once per table (one result each); those are merged.
// Hand-record-only files (no results) still import fine — the boards just have an empty field.

import { parseContract } from "../core/contract";
import { parsePbnDeal, handToString } from "../core/deal";
import { type Seat, type Strain, SEATS } from "../core/types";
import { parseVulnerability, type BoardFileV1, type FieldResultFileV1, type GameFileV1 } from "./gameFile";

interface PbnGame {
  tags: Map<string, string>;
  tables: Map<string, { columns: string[]; rows: string[][] }>;
  commentary: string[];
}

const TAG_RE = /^\[(\w+)\s+"((?:[^"\\]|\\.)*)"\]\s*$/;

/** Split a PBN file into its games (tag sections). */
export function readPbnGames(text: string): PbnGame[] {
  const games: PbnGame[] = [];
  let current: PbnGame | null = null;
  let table: { columns: string[]; rows: string[][] } | null = null;
  let inComment = false;
  let commentBuf: string[] = [];
  const last = new Map<string, string>(); // for "#" (copy from previous game)

  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  for (const raw of lines) {
    let line = raw;

    if (inComment) {
      const end = line.indexOf("}");
      if (end === -1) {
        commentBuf.push(line);
        continue;
      }
      commentBuf.push(line.slice(0, end));
      current?.commentary.push(commentBuf.join("\n").trim());
      commentBuf = [];
      inComment = false;
      line = line.slice(end + 1);
    }

    const trimmed = line.trim();
    if (trimmed.startsWith("%")) continue; // escape / directive lines
    if (trimmed === "") {
      table = null;
      continue;
    }
    if (trimmed.startsWith("{")) {
      const end = trimmed.indexOf("}");
      if (end === -1) {
        inComment = true;
        commentBuf = [trimmed.slice(1)];
      } else {
        current?.commentary.push(trimmed.slice(1, end).trim());
      }
      continue;
    }

    const m = TAG_RE.exec(trimmed);
    if (m) {
      const name = m[1]!;
      // PBN only escapes \" and \\ inside values; other backslashes (e.g. "Contract\4L") are literal.
      let value = m[2]!.replace(/\\(["\\])/g, "$1");
      if (value === "#") value = last.get(name) ?? "";
      last.set(name, value);

      // A new game starts at [Event] or at a [Board] tag when the current game already has one.
      if (!current || name === "Event" || (name === "Board" && current.tags.has("Board"))) {
        current = { tags: new Map(), tables: new Map(), commentary: [] };
        games.push(current);
      }
      current.tags.set(name, value);
      table = null;
      if (name.endsWith("Table")) {
        table = { columns: value.split(";").map((c) => c.split("\\")[0]!.trim()), rows: [] };
        current.tables.set(name, table);
      }
      continue;
    }

    if (table && current) {
      // Table row: whitespace-separated tokens, quoted tokens may contain spaces.
      const tokens = [...trimmed.matchAll(/"([^"]*)"|(\S+)/g)].map((t) => t[1] ?? t[2]!);
      table.rows.push(tokens);
    }
  }
  return games;
}

/** BridgeComposer's [DoubleDummyTricks]: 20 hex digits, declarers N,S,E,W × strains NT,S,H,D,C. */
function parseDoubleDummyTricks(text: string): Record<Seat, Record<Strain, number>> | null {
  const t = text.trim();
  if (!/^[0-9a-dA-D]{20}$/.test(t)) return null;
  const order: Seat[] = ["N", "S", "E", "W"];
  const strains: Strain[] = ["NT", "S", "H", "D", "C"];
  const out = {} as Record<Seat, Record<Strain, number>>;
  order.forEach((seat, i) => {
    out[seat] = {} as Record<Strain, number>;
    strains.forEach((strain, j) => {
      out[seat][strain] = parseInt(t[i * 5 + j]!, 16);
    });
  });
  return out;
}

/** "NS 420" / "EW 50" / "NS -100" → NS score. */
function parseOptimumScore(text: string): number | null {
  const m = /^(NS|EW)\s+(-?\d+)$/i.exec(text.trim());
  if (!m) return null;
  const n = Number(m[2]);
  return m[1]!.toUpperCase() === "NS" ? n : -n;
}

/** Tricks from a Result field: "10" (tricks taken), or relative "=", "+1", "-2". */
function parseTricks(result: string, contract: string): number | null {
  const r = result.trim();
  if (/^\d{1,2}$/.test(r)) return Number(r);
  const c = parseContract(contract);
  if (!c) return 0;
  if (r === "=" || r.toLowerCase() === "made") return c.level + 6;
  const m = /^([+-])(\d+)$/.exec(r);
  if (m) return c.level + 6 + (m[1] === "+" ? 1 : -1) * Number(m[2]);
  return null;
}

/** Turn one traveller line into a field result, or null if the table didn't play it. */
function fieldLine(contract: string | undefined, declarer: string | undefined, result: string | undefined) {
  if (!contract || contract === "-" || contract === "") return null;
  const isPass = /^pass/i.test(contract);
  const line: FieldResultFileV1 = { contract: isPass ? "PASS" : contract.toUpperCase() };
  if (!isPass) {
    const tricks = result == null ? null : parseTricks(result, contract);
    if (tricks == null || !declarer) return null;
    line.declarer = declarer.toUpperCase();
    line.tricks = tricks;
  }
  return line;
}

function readField(game: PbnGame): FieldResultFileV1[] {
  const out: FieldResultFileV1[] = [];

  const score = game.tables.get("ScoreTable");
  if (score) {
    const col = (name: string) => score.columns.findIndex((c) => c.toLowerCase() === name.toLowerCase());
    const [ci, di, ri, si] = [col("Contract"), col("Declarer"), col("Result"), col("Score_NS")];
    for (const row of score.rows) {
      const line = fieldLine(row[ci], row[di], row[ri]);
      if (!line) continue;
      const ns = si >= 0 ? Number(row[si]) : NaN;
      if (Number.isFinite(ns)) line.nsScore = ns;
      out.push(line);
    }
  } else if (game.tags.has("Contract")) {
    const line = fieldLine(game.tags.get("Contract"), game.tags.get("Declarer"), game.tags.get("Result"));
    if (line) out.push(line);
  }
  return out;
}

/** Convert PBN text into our game file format. `name` (usually the file name) seeds the id/title. */
export function pbnToGameFile(text: string, name: string): GameFileV1 {
  const games = readPbnGames(text);
  const boards = new Map<number, BoardFileV1>();

  let event: string | undefined;
  let date: string | undefined;
  for (const g of games) {
    event ??= g.tags.get("Event") || undefined;
    date ??= g.tags.get("Date")?.replace(/\./g, "-").replace(/\?+/g, "") || undefined;

    const number = Number(g.tags.get("Board"));
    const dealText = g.tags.get("Deal");
    if (!Number.isInteger(number) || !dealText) continue;

    let board = boards.get(number);
    if (!board) {
      const deal = parsePbnDeal(dealText);
      const hands: Record<string, string> = {};
      for (const seat of SEATS) hands[seat] = handToString(deal[seat]);
      board = {
        number,
        dealer: g.tags.get("Dealer") ?? SEATS[(number - 1) % 4]!,
        vul: parseVulnerability(g.tags.get("Vulnerable") ?? "None"),
        hands,
        field: [],
      };
      const dd = parseDoubleDummyTricks(g.tags.get("DoubleDummyTricks") ?? "");
      if (dd) {
        board.doubleDummy = { tricks: dd };
        const par = parseOptimumScore(g.tags.get("OptimumScore") ?? "");
        if (par != null) board.doubleDummy.par = { nsScore: par, contracts: [] };
      }
      if (g.commentary.length) board.commentary = g.commentary.join("\n\n");
      boards.set(number, board);
    }
    board.field!.push(...readField(g));
  }

  if (boards.size === 0) throw new Error("No boards with a [Deal] found in this PBN file");

  // Merge identical traveller lines into counts. Validation (bad contracts, scores that don't
  // match the rules) happens in parseGameFile, the same as for every other source.
  for (const b of boards.values()) {
    const merged = new Map<string, FieldResultFileV1>();
    for (const f of b.field ?? []) {
      const key = `${f.contract}|${f.declarer ?? ""}|${f.tricks ?? ""}`;
      const existing = merged.get(key);
      if (existing) existing.count = (existing.count ?? 1) + 1;
      else merged.set(key, { ...f, count: 1 });
    }
    b.field = [...merged.values()];
  }

  const base = name.replace(/\.[^.]+$/, "");
  return {
    schemaVersion: 1,
    id: `pbn-${base.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    title: event ? `${event}${base && !event.includes(base) ? ` (${base})` : ""}` : base,
    ...(date ? { date } : {}),
    source: { name: "Imported PBN", attribution: `Imported from ${name}` },
    boards: [...boards.values()].sort((a, b) => a.number - b.number),
  };
}

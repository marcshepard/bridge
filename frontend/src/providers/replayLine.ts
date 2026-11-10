// The replay line: one board's bidding, with the call someone questioned, in one line of text. The
// bidding feedback email ends with it, and the dev-only replay card on Home reads it back, so a
// reported bid can be replayed exactly against the current bots.
//
//   For replay: 7 S Both | NS={"oneNtMin":16,"oneNtMax":18} EW={} | N:AK5.QJ74.862.943 ... | 1C PASS 1H PASS *2D PASS PASS PASS
//
// Board number, dealer and vulnerability; each side's bidding settings, only those that differ
// from SAYC as it comes ({} is plain SAYC); the deal in PBN; the whole auction, the reported call
// marked with * (a line without one reports the last call). Simulated hard calls are seeded from
// the hand and the auction, so these are all the bots need to bid it again the same way.
//
// A pasted line is validated like any import: a bad deal, an illegal call or an unknown seat
// throws. Unknown or out-of-range settings are dropped (parseSystemSettings).

import { type Call, callCode, canCall, parseCall } from "../core/auction";
import { SAYC_DEFAULTS, type SystemSettings, type TableSystems, parseSystemSettings } from "../core/bidding/system";
import { assertValidDeal, handToString, parsePbnDeal } from "../core/deal";
import { type Seat, SEATS } from "../core/types";
import { parseVulnerability } from "./gameFile";
import type { Board } from "./types";

export interface ReplayBoard {
  /** The board, with no field results. */
  board: Board;
  /** The whole auction. */
  calls: Call[];
  /** The reported call (its index in the auction). */
  reported: number;
  systems: TableSystems;
}

const PREFIX = "For replay:";

/** The settings that differ from SAYC as it comes, as compact JSON ("{}" for plain SAYC). */
function settingsDiff(s: SystemSettings): string {
  const diff: Record<string, unknown> = {};
  for (const key of Object.keys(SAYC_DEFAULTS) as (keyof SystemSettings)[]) {
    if (s[key] !== SAYC_DEFAULTS[key]) diff[key] = s[key];
  }
  return JSON.stringify(diff);
}

export function formatReplayLine({ board, calls, reported, systems }: ReplayBoard): string {
  const deal = "N:" + SEATS.map((s) => handToString(board.hands[s])).join(" ");
  return [
    `${PREFIX} ${board.number} ${board.dealer} ${board.vul}`,
    `NS=${settingsDiff(systems.NS)} EW=${settingsDiff(systems.EW)}`,
    deal,
    calls.map((c, i) => (i === reported ? "*" : "") + callCode(c)).join(" "),
  ].join(" | ");
}

/** Reads a replay line (with or without "For replay:", and wrapped over lines by a mail app). */
export function parseReplayLine(text: string): ReplayBoard {
  const flat = text.replace(/\s+/g, " ").trim();
  const body = flat.toLowerCase().startsWith(PREFIX.toLowerCase()) ? flat.slice(PREFIX.length) : flat;
  const parts = body.split("|").map((p) => p.trim());
  if (parts.length !== 4) throw new Error("A replay line has four parts separated by |: board, settings, deal, auction");
  const [head, settings, dealText, auction] = parts as [string, string, string, string];

  const h = /^(\d+) ([NESW]) (\S+)$/i.exec(head);
  if (!h) throw new Error(`"${head}" should be the board number, dealer and vulnerability, e.g. "7 S Both"`);
  const number = Number(h[1]);
  const dealer = h[2]!.toUpperCase() as Seat;
  const vul = parseVulnerability(h[3]!);

  const s = /^NS=(\{.*?\}) EW=(\{.*\})$/.exec(settings);
  if (!s) throw new Error(`"${settings}" should be each side's settings, e.g. NS={} EW={}`);
  const systems: TableSystems = { NS: parseSettings(s[1]!, "NS"), EW: parseSettings(s[2]!, "EW") };

  const hands = parsePbnDeal(dealText);
  assertValidDeal(hands);

  const calls: Call[] = [];
  let reported: number | null = null;
  for (const word of auction.split(" ").filter(Boolean)) {
    const code = word.replace(/^\*/, "");
    if (code !== word) {
      if (reported !== null) throw new Error("Only one call can be marked with *");
      reported = calls.length;
    }
    const call = parseCall(code.toUpperCase() === "P" ? "PASS" : code);
    if (!call) throw new Error(`"${code}" isn't a call`);
    if (!canCall(dealer, calls, call)) throw new Error(`${code} isn't allowed after ${calls.map(callCode).join(" ") || "the start"}`);
    calls.push(call);
  }
  if (calls.length === 0) throw new Error("The auction is empty");

  return { board: { number, dealer, vul, hands, field: [] }, calls, reported: reported ?? calls.length - 1, systems };
}

function parseSettings(json: string, side: string): SystemSettings {
  try {
    return parseSystemSettings(JSON.parse(json));
  } catch {
    throw new Error(`${side}'s settings aren't readable: ${json}`);
  }
}

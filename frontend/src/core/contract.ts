// Parsing and formatting contracts and table results.
//
// The text form is the compact one used in data files: "3NT", "4S", "4SX", "6HXX", "PASS".
// Display forms use suit symbols: "3NT", "4♠×", "6♥××".

import {
  type Contract,
  type Doubling,
  type Seat,
  type Strain,
  type TableResult,
  SEATS,
  SUIT_SYMBOLS,
} from "./types";

const CONTRACT_RE = /^([1-7])(NT|N|S|H|D|C)(XX|X)?$/i;

/** Parse "3NT" / "4SX" / "6HXX" / "PASS". Returns null for a pass-out. Throws on bad input. */
export function parseContract(text: string): Contract | null {
  const t = text.trim().toUpperCase().replace(/\s+/g, "");
  if (t === "PASS" || t === "P" || t === "PASSED" || t === "AP") return null;
  const m = CONTRACT_RE.exec(t);
  if (!m) throw new Error(`Unrecognised contract "${text}"`);
  const strain = (m[2] === "N" ? "NT" : m[2]) as Strain;
  return { level: Number(m[1]), strain, doubling: (m[3] ?? "") as Doubling };
}

/** Compact data-file form, e.g. "4SX". */
export function contractCode(c: Contract | null): string {
  if (!c) return "PASS";
  return `${c.level}${c.strain}${c.doubling}`;
}

/** Human form with suit symbols, e.g. "4♠×". */
export function formatContract(c: Contract | null): string {
  if (!c) return "Passed out";
  const strain = c.strain === "NT" ? "NT" : SUIT_SYMBOLS[c.strain];
  const dbl = c.doubling === "X" ? "×" : c.doubling === "XX" ? "××" : "";
  return `${c.level}${strain}${dbl}`;
}

/** "made", "+1", "−2" relative to the contract. */
export function formatTrickResult(r: TableResult): string {
  if (!r.contract) return "";
  const diff = r.tricks - (r.contract.level + 6);
  if (diff === 0) return "made";
  return diff > 0 ? `+${diff}` : `−${-diff}`;
}

/** e.g. "4♠× by S, −1" or "Passed out". */
export function formatTableResult(r: TableResult): string {
  if (!r.contract || !r.declarer) return "Passed out";
  return `${formatContract(r.contract)} by ${r.declarer}, ${formatTrickResult(r)}`;
}

export function parseSeat(text: string): Seat {
  const s = text.trim().toUpperCase().charAt(0) as Seat;
  if (!SEATS.includes(s)) throw new Error(`Unrecognised seat "${text}"`);
  return s;
}

/** Build a TableResult from the compact strings used in data files. */
export function tableResult(
  contract: string,
  declarer: string | null | undefined,
  tricks: number | null | undefined,
): TableResult {
  const c = parseContract(contract);
  if (!c) return { contract: null, declarer: null, tricks: 0 };
  if (!declarer) throw new Error(`Contract ${contract} has no declarer`);
  if (tricks == null || !Number.isInteger(tricks) || tricks < 0 || tricks > 13) {
    throw new Error(`Contract ${contract} has invalid tricks "${tricks}"`);
  }
  return { contract: c, declarer: parseSeat(declarer), tricks };
}

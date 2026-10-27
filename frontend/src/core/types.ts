// Basic bridge vocabulary shared by every layer of the app.
// Nothing in here knows where data comes from (see src/providers) or how it is shown (see src/ui).

export type Seat = "N" | "E" | "S" | "W";
export type Direction = "NS" | "EW";
export type Suit = "S" | "H" | "D" | "C";
export type Strain = Suit | "NT";
export type Vulnerability = "None" | "NS" | "EW" | "Both";
export type Doubling = "" | "X" | "XX";

export const SEATS: readonly Seat[] = ["N", "E", "S", "W"];
export const SUITS: readonly Suit[] = ["S", "H", "D", "C"];
/** Strains in bidding order, lowest first. */
export const STRAINS: readonly Strain[] = ["C", "D", "H", "S", "NT"];
/** Card ranks, highest first. "T" is the ten. */
export const RANKS = "AKQJT98765432";

export const SEAT_NAMES: Record<Seat, string> = {
  N: "North",
  E: "East",
  S: "South",
  W: "West",
};

export const SUIT_SYMBOLS: Record<Suit, string> = {
  S: "♠",
  H: "♥",
  D: "♦",
  C: "♣",
};

export function directionOf(seat: Seat): Direction {
  return seat === "N" || seat === "S" ? "NS" : "EW";
}

export function partnerOf(seat: Seat): Seat {
  return ({ N: "S", S: "N", E: "W", W: "E" } as const)[seat];
}

export function isVulnerable(vul: Vulnerability, side: Direction): boolean {
  return vul === "Both" || vul === side;
}

/**
 * A contract as bid at the table. `null` level means the board was passed out.
 */
export interface Contract {
  level: number; // 1–7
  strain: Strain;
  doubling: Doubling;
}

/** One table's result on a board: what was bid, who played it, how many tricks they took. */
export interface TableResult {
  contract: Contract | null; // null = passed out
  declarer: Seat | null; // null when passed out
  tricks: number; // tricks taken by declarer (0–13); ignored when passed out
}

/** A hand is 13 cards grouped by suit; each suit is a string of ranks, highest first, e.g. "AKT4". */
export type Hand = Record<Suit, string>;

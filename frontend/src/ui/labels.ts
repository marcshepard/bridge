// Wording that depends on where you sit: "Partner", "your left-hand opponent", "You're vulnerable".

import { type Seat, type Vulnerability, SEATS, SEAT_NAMES, directionOf, isVulnerable } from "../core/types";

export type Relation = "you" | "partner" | "lho" | "rho";

export function relationTo(me: Seat, other: Seat): Relation {
  const d = (SEATS.indexOf(other) - SEATS.indexOf(me) + 4) % 4;
  return (["you", "lho", "partner", "rho"] as const)[d]!;
}

const RELATION_SHORT: Record<Relation, string> = {
  you: "You",
  partner: "Partner",
  lho: "Left opp.",
  rho: "Right opp.",
};

const RELATION_LONG: Record<Relation, string> = {
  you: "you",
  partner: "your partner",
  lho: "your left-hand opponent",
  rho: "your right-hand opponent",
};

export function relationShort(me: Seat, other: Seat): string {
  return RELATION_SHORT[relationTo(me, other)];
}

export function seatWithRelation(me: Seat, other: Seat): string {
  return `${SEAT_NAMES[other]} (${RELATION_LONG[relationTo(me, other)]})`;
}

export function vulnerabilityPhrase(me: Seat, vul: Vulnerability): string {
  if (vul === "None") return "Nobody is vulnerable";
  if (vul === "Both") return "Everybody is vulnerable";
  return isVulnerable(vul, directionOf(me)) ? "You are vulnerable, they are not" : "They are vulnerable, you are not";
}

export function formatPct(pct: number | null): string {
  return pct === null ? "—" : `${pct.toFixed(1)}%`;
}

export function formatImps(n: number): string {
  return n > 0 ? `+${n}` : n < 0 ? `−${-n}` : "0";
}

/** "+66.7", "−12", "0": a ± margin, one decimal only when needed. */
export function formatMargin(n: number): string {
  const r = Math.round(n * 10) / 10;
  if (r === 0) return "0";
  const text = Number.isInteger(r) ? Math.abs(r).toString() : Math.abs(r).toFixed(1);
  return r > 0 ? `+${text}` : `−${text}`;
}

/** "K7PM3QXT" → "K7PM-3QXT": easier to read out and type. */
export function formatJoinCode(code: string): string {
  return code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
}

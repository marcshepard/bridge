// Wording that depends on where you sit: "Partner", "your left-hand opponent", "You're vulnerable".

import { type Seat, type Strain, type Suit, type Vulnerability, SEATS, SEAT_NAMES, directionOf, isVulnerable } from "../core/types";

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

const RELATION_PLACE: Record<Exclude<Relation, "you">, string> = {
  partner: "your partner",
  lho: "on your left",
  rho: "on your right",
};

/** A seat and who's in it, as seen from yours: "South (you)", "East (Joe, on your right)". */
export function seatAndPlayer(me: Seat, seat: Seat, name: string): string {
  const r = relationTo(me, seat);
  return r === "you" ? `${SEAT_NAMES[seat]} (you)` : `${SEAT_NAMES[seat]} (${name}, ${RELATION_PLACE[r]})`;
}

/** Who's vulnerable, short, from your side: "Both", "None", "N/S (you)", "E/W (them)". */
export function vulnerableShort(me: Seat, vul: Vulnerability): string {
  if (vul === "None" || vul === "Both") return vul;
  const side = vul === "NS" ? "N/S" : "E/W";
  return `${side} (${isVulnerable(vul, directionOf(me)) ? "you" : "them"})`;
}

/**
 * Which board this is: the original game's number, plus where it comes in the game you're playing
 * when that differs (a game started at board 7 shows "Board 7 (our board 1)").
 */
export function boardLabel(original: number, position: number): string {
  return original === position ? `Board ${original}` : `Board ${original} (our board ${position})`;
}

export function vulnerabilityPhrase(me: Seat, vul: Vulnerability): string {
  if (vul === "None") return "Nobody is vulnerable";
  if (vul === "Both") return "Everybody is vulnerable";
  return isVulnerable(vul, directionOf(me)) ? "You are vulnerable, they are not" : "They are vulnerable, you are not";
}

/**
 * The order to lay out a hand's suits side by side: trumps first, then the rest alternating black
 * and red so neighbouring suits never look alike. With no trumps (yet), ♠ ♥ ♣ ♦.
 */
export function handSuitOrder(trump: Strain | null): Suit[] {
  switch (trump) {
    case "H":
      return ["H", "S", "D", "C"];
    case "D":
      return ["D", "S", "H", "C"];
    case "C":
      return ["C", "H", "S", "D"];
    default:
      return ["S", "H", "C", "D"];
  }
}

/** Percentages are shown as whole numbers: "83%". (Calculations stay exact.) */
export function formatPct(pct: number | null): string {
  return pct === null ? "—" : `${Math.round(pct)}%`;
}

/**
 * A share of the field's tables, whole like any percentage, except that only none or all of them
 * shows as "0%" or "100%": 3 tables of 938 is "<1%" and 935 is ">99%", never "0%" or "100%".
 */
export function formatShare(pct: number): string {
  const whole = Math.round(pct);
  if (whole === 0 && pct > 0) return "<1%";
  if (whole === 100 && pct < 100) return ">99%";
  return `${whole}%`;
}

/**
 * Matchpoints for both sides, "83 / 17": yours rounded, theirs 100 minus that, so the pair always
 * adds up to 100 (50.5 / 49.5 shows as 51 / 49, never 51 / 50).
 */
export function formatMpPair(pct: number): string {
  const ours = Math.round(pct);
  return `${ours} / ${100 - ours}`;
}

export function formatImps(n: number): string {
  return n > 0 ? `+${n}` : n < 0 ? `−${-n}` : "0";
}

/** "+67", "−12.4", "0": a ± margin (a net) to one decimal, left off when it's zero. */
export function formatMargin(n: number): string {
  const r = Math.round(n * 10) / 10;
  if (r === 0) return "0";
  const abs = Number.isInteger(r) ? `${Math.abs(r)}` : Math.abs(r).toFixed(1);
  return r > 0 ? `+${abs}` : `−${abs}`;
}

/** "K7PM3QXT" → "K7PM-3QXT": easier to read out and type. */
export function formatJoinCode(code: string): string {
  return code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
}

/**
 * One board's net: your matchpoint % minus theirs ("+90.8"), with the percentages behind it
 * ("95.4 − 4.6"). All three are to one decimal, dropped when it's zero ("95%", never "95.0%"), and
 * the net comes from the % as shown, so the working always adds up on screen.
 */
export function netParts(pct: number): { net: string; working: string; pct: string } {
  const tenth = toTenth(pct);
  return {
    net: formatMargin(2 * tenth - 100),
    working: `${showTenth(tenth)} − ${showTenth(toTenth(100 - tenth))}`,
    pct: formatMp(pct),
  };
}

/** Your matchpoints: "96.3%", or "62%" when the decimal is zero. Every "your %" uses this. */
export function formatMp(pct: number | null): string {
  return pct === null ? "—" : `${showTenth(toTenth(pct))}%`;
}

function toTenth(n: number): number {
  return Math.round(n * 10) / 10;
}

function showTenth(n: number): string {
  return Number.isInteger(n) ? `${n}` : n.toFixed(1);
}


/**
 * A player with no live connection right now (asleep, closed the app, lost signal). You're never
 * shown as away on your own screen: if your connection is down, the header's "Reconnecting" icon says so.
 */
export function isAway(p: { connected: boolean; slot: number; noApp?: boolean }, mySlot: number | null): boolean {
  // A player without the app is at the table, just not on a device.
  return !p.connected && !p.noApp && p.slot !== mySlot;
}

/**
 * Whether two display names are the same person's, ignoring case and spacing: a seat request under
 * the seat's own name is someone moving to another device, not a replacement.
 */
export function sameName(a: string, b: string): boolean {
  const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
  return norm(a) === norm(b);
}

/** What the table is told when a seat request ends. Cancelled requests just disappear. */
export function seatRequestNews(
  outcome: "allowed" | "denied" | "cancelled",
  name: string,
  replacedName: string,
  answeredBy: string | null,
): string | null {
  const moving = sameName(name, replacedName);
  if (outcome === "allowed") return moving ? `${name} has moved to another device.` : `${name} has replaced ${replacedName}.`;
  if (outcome === "denied") {
    const who = answeredBy ?? "Someone";
    return moving ? `${who} didn't let ${name} move to another device.` : `${who} didn't let ${name} replace ${replacedName}.`;
  }
  return null;
}

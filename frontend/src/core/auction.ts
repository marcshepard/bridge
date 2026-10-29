// The auction: whose call it is, which calls are allowed, and the contract it ends in. Pure
// functions, used by the devices (to grey out calls you can't make) and by the backend (to check
// every call), so both apply the same rules.

import { nextSeat } from "./play";
import { type Contract, type Doubling, type Seat, type Strain, STRAINS, directionOf } from "./types";

export type Call =
  | { kind: "bid"; level: number; strain: Strain }
  | { kind: "pass" }
  | { kind: "double" }
  | { kind: "redouble" };

/** Compact form, as stored and sent: "1H", "3NT", "PASS", "X", "XX". */
export function callCode(call: Call): string {
  switch (call.kind) {
    case "bid":
      return `${call.level}${call.strain}`;
    case "pass":
      return "PASS";
    case "double":
      return "X";
    case "redouble":
      return "XX";
  }
}

const BID_RE = /^([1-7])(NT|C|D|H|S)$/;

/** The call a compact form stands for, or null if it isn't one. */
export function parseCall(text: string): Call | null {
  const t = text.trim().toUpperCase();
  if (t === "PASS") return { kind: "pass" };
  if (t === "X") return { kind: "double" };
  if (t === "XX") return { kind: "redouble" };
  const m = BID_RE.exec(t);
  return m ? { kind: "bid", level: Number(m[1]), strain: m[2] as Strain } : null;
}

/** Who makes call number `index` (0 for the dealer's). */
export function seatOfCall(dealer: Seat, index: number): Seat {
  let seat = dealer;
  for (let i = 0; i < index % 4; i++) seat = nextSeat(seat);
  return seat;
}

/** Whose call it is next. */
export function toCall(dealer: Seat, calls: Call[]): Seat {
  return seatOfCall(dealer, calls.length);
}

/** Bids in order, lowest first: 1♣ is 0, 7NT is 34. */
function bidRank(level: number, strain: Strain): number {
  return (level - 1) * STRAINS.length + STRAINS.indexOf(strain);
}

/** The last call that wasn't a pass, and its position, or null if there's none. */
function lastAction(calls: Call[]): { call: Call; index: number } | null {
  for (let i = calls.length - 1; i >= 0; i--) if (calls[i]!.kind !== "pass") return { call: calls[i]!, index: i };
  return null;
}

/** Over after four passes to start, or three passes in a row after a bid. */
export function isAuctionOver(calls: Call[]): boolean {
  if (calls.length < 4) return false;
  return calls.slice(-3).every((c) => c.kind === "pass");
}

/**
 * Whether the next player may make this call: a bid must be higher than the last one; a double
 * only of an opponent's bid that isn't doubled yet; a redouble only of an opponent's double.
 */
export function canCall(dealer: Seat, calls: Call[], call: Call): boolean {
  if (isAuctionOver(calls)) return false;
  const me = toCall(dealer, calls);
  const last = lastAction(calls);
  const byOpponent = !!last && directionOf(seatOfCall(dealer, last.index)) !== directionOf(me);
  switch (call.kind) {
    case "pass":
      return true;
    case "bid": {
      if (!Number.isInteger(call.level) || call.level < 1 || call.level > 7 || !STRAINS.includes(call.strain)) return false;
      const lastBid = [...calls].reverse().find((c) => c.kind === "bid");
      return !lastBid || bidRank(call.level, call.strain) > bidRank(lastBid.level, lastBid.strain);
    }
    case "double":
      return byOpponent && last!.call.kind === "bid";
    case "redouble":
      return byOpponent && last!.call.kind === "double";
  }
}

/**
 * The contract the auction ended in, and its declarer: the first player on the declaring side to
 * name the final strain. `contract: null` means passed out. Null while the auction is still going.
 */
export function auctionResult(dealer: Seat, calls: Call[]): { contract: Contract | null; declarer: Seat | null } | null {
  if (!isAuctionOver(calls)) return null;
  let finalIndex = -1;
  for (let i = calls.length - 1; i >= 0 && finalIndex < 0; i--) if (calls[i]!.kind === "bid") finalIndex = i;
  if (finalIndex < 0) return { contract: null, declarer: null };
  const final = calls[finalIndex] as Extract<Call, { kind: "bid" }>;
  const side = directionOf(seatOfCall(dealer, finalIndex));
  const firstIndex = calls.findIndex(
    (c, i) => c.kind === "bid" && c.strain === final.strain && directionOf(seatOfCall(dealer, i)) === side,
  );
  const after = calls.slice(finalIndex + 1).filter((c) => c.kind !== "pass");
  const doubling: Doubling = after.at(-1)?.kind === "redouble" ? "XX" : after.at(-1)?.kind === "double" ? "X" : "";
  return {
    contract: { level: final.level, strain: final.strain, doubling },
    declarer: seatOfCall(dealer, firstIndex),
  };
}

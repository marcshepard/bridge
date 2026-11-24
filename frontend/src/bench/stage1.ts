// Stage 1 of the evaluation harness (docs/HARNESS.md): the bots bid each deal with East–West
// silent, and each contract is scored against the ideal for North–South's two hands.

import { type Call, auctionResult, callCode, isAuctionOver } from "../core/auction";
import { type Decision, decide, positionAt } from "../core/bidding/bidder";
import { callName } from "../core/bidding/sayc/common";
import { SAYC_DEFAULTS } from "../core/bidding/system";
import { contractCode } from "../core/contract";
import type { Hand, Seat } from "../core/types";
import { type BenchDeal, handsOf } from "./deals";
import { type Miss, CLASS_NAMES, contractClass, contractOptions, expectedLoss, missKind, optionFor } from "./ideal";

const SILENT: Decision = { call: { kind: "pass" }, meaning: "Pass.", reason: "the opponents are silent in this test", name: null, hard: null, fallback: false };

/** The bots' auction with East and West passing throughout. */
export function silentAuction(hands: Record<Seat, Hand>, deal: Pick<BenchDeal, "dealer" | "vul">): Decision[] {
  const out: Decision[] = [];
  const calls: Call[] = [];
  for (let i = 0; i < 60 && !isAuctionOver(calls); i++) {
    const p = positionAt(deal, calls, SAYC_DEFAULTS);
    const d = p.seat === "E" || p.seat === "W" ? SILENT : decide(p, hands[p.seat]);
    out.push(d);
    calls.push(d.call);
  }
  return out;
}

/** One board of a run. */
export interface BoardResult {
  id: number;
  /** The calls, as codes ("1S P 2C P ..."). */
  auction: string;
  /** "4S", or "PASS". */
  contract: string;
  declarer: Seat | null;
  /** Expected IMPs lost against the ideal. */
  loss: number;
  ideal: string;
  idealDeclarer: Seat | null;
  /** The ideal contract's level: "Part-score", "Game"... */
  idealClass: string;
  miss: Miss;
  /** Situations: the opening, conventions used, opening seat. */
  tags: string[];
  /** Calls with no rule. */
  fallbacks: number;
  /** Each call's reason, in order (only in full run files, for `show`). */
  reasons?: string[];
}

/** Bid one board and score it. `layouts` are the cached tricks for the board. */
export function runBoard(deal: BenchDeal, layouts: string[], withReasons: boolean): BoardResult {
  const hands = handsOf(deal);
  const decisions = silentAuction(hands, deal);
  const calls = decisions.map((d) => d.call);
  const end = auctionResult(deal.dealer, calls);
  const contract = end?.contract ? { ...end.contract, doubling: "" as const } : null;
  const declarer = end?.declarer ?? null;

  const options = contractOptions(layouts, deal.vul);
  const ideal = options[0]!;
  const bot = optionFor(options, contract, declarer);
  const loss = expectedLoss(ideal, bot);
  return {
    id: deal.id,
    auction: calls.map(callCode).join(" "),
    contract: contractCode(contract),
    declarer,
    loss: Math.round(loss * 1000) / 1000,
    ideal: contractCode(ideal.contract),
    idealDeclarer: ideal.declarer,
    idealClass: CLASS_NAMES[contractClass(ideal.contract)]!,
    miss: missKind(bot, ideal, loss),
    tags: situationTags(deal, decisions),
    fallbacks: decisions.filter((d) => d.fallback).length,
    ...(withReasons && { reasons: decisions.map((d) => d.reason) }),
  };
}

/** The situations a board falls under, from North–South's calls. */
export function situationTags(deal: Pick<BenchDeal, "dealer">, decisions: Decision[]): string[] {
  const seats: Seat[] = ["N", "E", "S", "W"];
  const seatAt = (i: number) => seats[(seats.indexOf(deal.dealer) + i) % 4]!;
  const ns = decisions.map((d, i) => ({ d, seat: seatAt(i), i })).filter((x) => x.seat === "N" || x.seat === "S");
  const opening = ns.find((x) => x.d.call.kind === "bid");
  if (!opening) return ["Passed out"];
  const tags = new Set<string>([`${callName(opening.d.call)} opening`]);
  if (opening.d.name) tags.add(opening.d.name);
  if (opening.i >= 2) tags.add("Opened in third or fourth seat");
  for (const x of ns) if (x.d.name) tags.add(x.d.name);
  return [...tags];
}

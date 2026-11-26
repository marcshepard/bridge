// The weak-opening experiment (docs/HARNESS.md, stage 2): how strict should a weak two's or a
// three-level preempt's suit be? A set holds deals where the first player to open in seats one to
// three has a weak-two or preempt hand by the loosest standard tested. Each deal is bid twice, with
// the opponents bidding normally both times: once with the preempting side on the base card and once
// on the variant. Both contracts are scored on the deal's own double-dummy tricks, and the difference
// is in IMPs for the preempting side. Same deal, same opponents, so only the change in the rules shows.
//
// The filter is frozen and doesn't use the bidder, so a bidding change never changes the set. Change
// it only with a new version number, which makes a new set.

import { type Call, auctionResult, callCode, isAuctionOver } from "../core/auction";
import { type Decision, decide, decideWithSimulation, positionAt } from "../core/bidding/bidder";
import type { SimulationOptions } from "../core/bidding/simulate";
import type { DoubleDummySolver } from "../core/doubleDummy";
import type { SystemSettings } from "../core/bidding/system";
import { contractCode } from "../core/contract";
import { boardDealer, boardVulnerability, randomDeal } from "../core/deal";
import type { DoubleDummyTable } from "../core/doubleDummy";
import { imps } from "../core/imps";
import { seeded } from "../core/random";
import { scoreResult } from "../core/scoring";
import { type Hand, type Seat, type Strain, type Suit, type Vulnerability, SEATS, SUITS, SUIT_SYMBOLS } from "../core/types";
import { type BenchDeal, handsOf, toPbn } from "./deals";
import { bootstrapCi } from "./report";

/** Version of the filter and the dealing below. */
export const WEAK_FILTER_VERSION = 1;

export interface WeakSetDefinition {
  stage: "weak";
  deals: number;
  seed: number;
  filter: number;
}

export const DEFAULT_WEAK_SET: WeakSetDefinition = { stage: "weak", deals: 1500, seed: 101, filter: WEAK_FILTER_VERSION };

export interface WeakDeal extends BenchDeal {
  /** The player with the weak opening. */
  preemptor: Seat;
}

const HCP: Record<string, number> = { A: 4, K: 3, Q: 2, J: 1 };
const hcpOf = (hand: Hand) => SUITS.reduce((n, s) => n + [...hand[s]].reduce((m, r) => m + (HCP[r] ?? 0), 0), 0);

/**
 * A weak two (six cards in ♠ ♥ ♦, 5–11 HCP, no side four-card major) or a three-level preempt
 * (seven cards, 5–10 HCP), whatever the suit's quality: the loosest standard tested.
 */
export function weakKind(hand: Hand): { kind: "two" | "three"; suit: Suit } | null {
  const hcp = hcpOf(hand);
  for (const s of SUITS) {
    const n = hand[s].length;
    if (n === 7 && hcp >= 5 && hcp <= 10) return { kind: "three", suit: s };
    if (n === 6 && s !== "C" && hcp >= 5 && hcp <= 11 && (["S", "H"] as Suit[]).every((m) => m === s || hand[m].length < 4)) return { kind: "two", suit: s };
  }
  return null;
}

/** Would this hand open in one of the first three seats anyway (12+ HCP or the rule of 20)? */
function opens(hand: Hand): boolean {
  const hcp = hcpOf(hand);
  const [a, b] = SUITS.map((s) => hand[s].length).sort((x, y) => y - x) as [number, number];
  return hcp >= 12 || hcp + a + b >= 20;
}

/** The player with the weak opening: the first in seats one to three to open, if it's a weak hand. */
export function preemptorOf(hands: Record<Seat, Hand>, dealer: Seat): Seat | null {
  for (let i = 0; i < 3; i++) {
    const seat = SEATS[(SEATS.indexOf(dealer) + i) % 4]!;
    if (opens(hands[seat])) return null;
    if (weakKind(hands[seat])) return seat;
  }
  return null;
}

/**
 * The set's deals: random deals with a weak opening, dealer and vulnerability by board number. With
 * filter 0, every random deal (for checks on ordinary auctions); `preemptor` is then the dealer.
 */
export function weakDealSet(def: WeakSetDefinition): WeakDeal[] {
  const rand = seeded(def.seed);
  const out: WeakDeal[] = [];
  for (let id = 1; id <= def.deals; id++) {
    const dealer = boardDealer(id);
    for (;;) {
      const hands = randomDeal(rand);
      const preemptor = def.filter === 0 ? dealer : preemptorOf(hands, dealer);
      if (preemptor) {
        out.push({ id, dealer, vul: boardVulnerability(id), pbn: toPbn(hands), preemptor });
        break;
      }
    }
  }
  return out;
}

const TABLE_STRAINS: readonly Strain[] = ["C", "D", "H", "S", "NT"];

/** A deal's double-dummy table as 20 hex digits: N, E, S, W declaring in ♣ ♦ ♥ ♠ NT. */
export function encodeTable(t: DoubleDummyTable): string {
  return SEATS.map((d) => TABLE_STRAINS.map((s) => t[d][s].toString(16)).join("")).join("");
}

export function tableTricks(code: string, declarer: Seat, strain: Strain): number {
  return parseInt(code[SEATS.indexOf(declarer) * 5 + TABLE_STRAINS.indexOf(strain)]!, 16);
}

/** The auction with each side bidding by its own card. */
export function sidedAuction(hands: Record<Seat, Hand>, deal: Pick<BenchDeal, "dealer" | "vul">, cards: { NS: SystemSettings; EW: SystemSettings }): Decision[] {
  const out: Decision[] = [];
  const calls: Call[] = [];
  for (let i = 0; i < 80 && !isAuctionOver(calls); i++) {
    const seat = SEATS[(SEATS.indexOf(deal.dealer) + calls.length) % 4]!;
    // Both cards: each call is read by its maker's card, as the opponents' convention card tells you.
    const d = decide(positionAt(deal, calls, cards), hands[seat]);
    out.push(d);
    calls.push(d.call);
  }
  return out;
}

/** One of the two auctions on a board, scored for the preempting side. */
export interface WeakTable {
  auction: string;
  /** "4SX", or "PASS". */
  contract: string;
  declarer: Seat | null;
  /** For the preempting side. */
  score: number;
  /** The preemptor's first call. */
  opening: string;
  reasons: string[];
}

export interface WeakBoard {
  id: number;
  preemptor: Seat;
  base: WeakTable;
  variant: WeakTable;
  /** IMPs for the preempting side, the variant against the base (positive: the variant gained). */
  imps: number;
  tags: string[];
}

const sideOf = (seat: Seat) => (seat === "N" || seat === "S" ? "NS" : "EW");
const vulnerable = (vul: Vulnerability, side: "NS" | "EW") => vul === "Both" || vul === side;

function table(deal: WeakDeal, code: string, decisions: Decision[]): WeakTable {
  const calls = decisions.map((d) => d.call);
  const end = auctionResult(deal.dealer, calls);
  const contract = end?.contract ?? null;
  const declarer = end?.declarer ?? null;
  const ns = contract && declarer ? scoreResult({ contract, declarer, tricks: tableTricks(code, declarer, contract.strain) }, deal.vul).nsScore : 0;
  const offset = (SEATS.indexOf(deal.preemptor) - SEATS.indexOf(deal.dealer) + 4) % 4;
  return {
    auction: calls.map(callCode).join(" "),
    contract: contractCode(contract),
    declarer,
    score: sideOf(deal.preemptor) === "NS" ? ns : -ns,
    opening: callCode(calls[offset] ?? { kind: "pass" }),
    reasons: decisions.map((d) => d.reason),
  };
}

/** Bid one board both ways and score it. */
export function runWeakBoard(deal: WeakDeal, code: string, base: SystemSettings, variant: SystemSettings): WeakBoard {
  const hands = handsOf(deal);
  const side = sideOf(deal.preemptor);
  const b = table(deal, code, sidedAuction(hands, deal, { NS: base, EW: base }));
  const v = table(deal, code, sidedAuction(hands, deal, side === "NS" ? { NS: variant, EW: base } : { NS: base, EW: variant }));
  return weakBoardFrom(deal, b, v);
}

function weakBoardFrom(deal: WeakDeal, b: WeakTable, v: WeakTable): WeakBoard {
  const hands = handsOf(deal);
  const side = sideOf(deal.preemptor);
  const kind = weakKind(hands[deal.preemptor])!;
  const seat = (SEATS.indexOf(deal.preemptor) - SEATS.indexOf(deal.dealer) + 4) % 4;
  const change =
    b.opening === v.opening ? (b.auction === v.auction ? "Same auction" : "Same opening, different auction") : b.opening === "PASS" ? "Opened only with the variant" : v.opening === "PASS" ? "Opened only with the base" : "Different opening";
  return {
    id: deal.id,
    preemptor: deal.preemptor,
    base: b,
    variant: v,
    imps: imps(v.score - b.score),
    tags: [
      kind.kind === "two" ? `Weak two hand in ${SUIT_SYMBOLS[kind.suit]}` : "Three-level preempt hand",
      vulnerable(deal.vul, side) ? "Preemptor vulnerable" : "Preemptor not vulnerable",
      ["First seat", "Second seat", "Third seat"][seat]!,
      change,
    ],
  };
}

/**
 * The same paired comparison with the defending side simulating its hard and judgment calls, as the
 * bots play; the preempting side bids by its rules (the variant or the base).
 */
export async function runWeakBoardSimulated(deal: WeakDeal, code: string, base: SystemSettings, variant: SystemSettings, solver: DoubleDummySolver, options: SimulationOptions): Promise<WeakBoard> {
  const hands = handsOf(deal);
  const side = sideOf(deal.preemptor);
  const defenders = side === "NS" ? "EW" : "NS";
  const b = table(deal, code, (await simulatedAuction(hands, deal, { NS: base, EW: base }, defenders, solver, options)).decisions);
  const cards = side === "NS" ? { NS: variant, EW: base } : { NS: base, EW: variant };
  const v = table(deal, code, (await simulatedAuction(hands, deal, cards, defenders, solver, options)).decisions);
  return weakBoardFrom(deal, b, v);
}

export interface WeakRunFile {
  id: string;
  set: string;
  label: string;
  commit: string;
  dirty: boolean;
  createdAt: string;
  ms: number;
  /** Settings changed from SAYC for both sides (the base), and for the preempting side (the variant). */
  base: Record<string, string | number | boolean>;
  variant: Record<string, string | number | boolean>;
  boards: WeakBoard[];
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const signed = (n: number, d = 2) => (Math.abs(n) < 0.5 * 10 ** -d ? (0).toFixed(d) : (n > 0 ? "+" : "−") + Math.abs(n).toFixed(d));
const cardText = (c: Record<string, unknown>) => (Object.keys(c).length ? Object.entries(c).map(([k, v]) => `${k}=${v}`).join(", ") : "SAYC");

/** The run's report: IMPs for the variant, where they came from, and the biggest swings. */
export function weakSummary(run: WeakRunFile, top = 10): string {
  const lines: string[] = [];
  const all = run.boards.map((b) => b.imps);
  const ci = bootstrapCi(all);
  const changed = run.boards.filter((b) => b.base.auction !== b.variant.auction);
  const verdict = ci[0] > 0 ? "the variant gains" : ci[1] < 0 ? "the variant loses" : "no clear difference";
  lines.push(`Weak-opening set ${run.set} (${run.boards.length} deals with a weak two or three-level preempt hand)`);
  lines.push(`Run:      ${run.id}  ${run.commit}${run.dirty ? " (with uncommitted changes)" : ""}${run.label ? `  "${run.label}"` : ""}`);
  lines.push(`Base:     ${cardText(run.base)} for both sides`);
  lines.push(`Variant:  ${cardText({ ...run.base, ...run.variant })} for the preempting side only`);
  lines.push("");
  lines.push("IMPs per board for the preempting side, the variant against the base (positive: the variant gains)");
  lines.push(`  All boards        ${signed(mean(all)).padStart(6)}  (${signed(ci[0])} to ${signed(ci[1])})  ${verdict}`);
  lines.push(`  Changed boards    ${changed.length} of ${run.boards.length}: ${signed(mean(changed.map((b) => b.imps)))} IMPs per changed board, ${signed(changed.reduce((s, b) => s + b.imps, 0), 0)} in all`);
  lines.push("");
  const tagSet = new Set(run.boards.flatMap((b) => b.tags));
  lines.push(`${"By situation".padEnd(40)}${"boards".padStart(7)}${"changed".padStart(9)}${"IMPs".padStart(8)}${"per board".padStart(11)}`);
  for (const t of [...tagSet].sort()) {
    const bs = run.boards.filter((b) => b.tags.includes(t));
    const sum = bs.reduce((s, b) => s + b.imps, 0);
    lines.push(`  ${t.padEnd(38)}${String(bs.length).padStart(7)}${String(bs.filter((b) => b.base.auction !== b.variant.auction).length).padStart(9)}${signed(sum, 0).padStart(8)}${signed(sum / bs.length).padStart(11)}`);
  }
  lines.push("");
  lines.push("Biggest swings");
  for (const b of [...changed].sort((x, y) => Math.abs(y.imps) - Math.abs(x.imps)).slice(0, top)) {
    const t = (x: WeakTable) => `${x.contract}${x.declarer ? ` ${x.declarer}` : ""}`.padEnd(8);
    lines.push(`  Board ${String(b.id).padStart(4)}  opening ${b.base.opening.padEnd(4)} → ${b.variant.opening.padEnd(4)}  ${t(b.base)} → ${t(b.variant)} ${signed(b.imps, 0).padStart(4)} IMPs`);
  }
  lines.push("");
  lines.push(`One board in full: npm run bench -- weak-show ${run.id} --board <number>`);
  return lines.join("\n");
}

/** One board in full: the hands, both auctions with each call's reason, and the scores. */
export function weakBoardText(deal: WeakDeal, board: WeakBoard): string {
  const hands = handsOf(deal);
  const lines = [`Board ${deal.id}  dealer ${deal.dealer}  vulnerable: ${deal.vul}  weak hand: ${deal.preemptor}`];
  for (const s of SEATS) lines.push(`  ${s}  ${SUITS.map((x) => `${SUIT_SYMBOLS[x]}${hands[s][x] || "—"}`).join(" ")}`);
  for (const [name, t] of [["Base", board.base], ["Variant", board.variant]] as const) {
    lines.push("", `${name}: ${t.contract}${t.declarer ? ` by ${t.declarer}` : ""}, ${t.score >= 0 ? "+" : ""}${t.score} for the preempting side`);
    const calls = t.auction.split(" ");
    calls.forEach((c, i) => lines.push(`  ${SEATS[(SEATS.indexOf(deal.dealer) + i) % 4]}  ${c.padEnd(5)} ${t.reasons[i] ?? ""}`));
  }
  lines.push("", `Variant against base: ${signed(board.imps, 0)} IMPs for the preempting side`);
  return lines.join("\n");
}

// ---- Par, and the defence against a preempt ------------------------------------------------------

/**
 * Par for a deal from its double-dummy table, from North–South's side: the result when both sides
 * bid perfectly. Over each contract, the other side either lets it stand (doubled if it fails) or
 * outbids it; the side that acts first is the dealer's.
 */
export function parScore(code: string, vul: Vulnerability, dealer: Seat): number {
  const contracts: { level: number; strain: Strain }[] = [];
  for (let level = 1; level <= 7; level++) for (const strain of TABLE_STRAINS) contracts.push({ level, strain });
  const sides = ["NS", "EW"] as const;
  const declarers = { NS: ["N", "S"], EW: ["E", "W"] } as const;
  // The side's result if contract i stands, from that side's view.
  const stands = (i: number, side: "NS" | "EW") => {
    const { level, strain } = contracts[i]!;
    const declarer = [...declarers[side]].sort((a, b) => tableTricks(code, b, strain) - tableTricks(code, a, strain))[0]!;
    const tricks = tableTricks(code, declarer, strain);
    const doubling = tricks >= level + 6 ? "" : "X";
    const ns = scoreResult({ contract: { level, strain, doubling }, declarer, tricks }, vul).nsScore;
    return side === "NS" ? ns : -ns;
  };
  // value[side][i]: contract i bid by `side`, the other side to act; from `side`'s view.
  const value = { NS: new Array<number>(contracts.length), EW: new Array<number>(contracts.length) };
  const bestAbove = { NS: -Infinity, EW: -Infinity }; // max over j > i of value[side][j]
  for (let i = contracts.length - 1; i >= 0; i--) {
    for (const side of sides) {
      const other = side === "NS" ? "EW" : "NS";
      value[side][i] = Math.min(stands(i, side), -bestAbove[other]);
    }
    for (const side of sides) bestAbove[side] = Math.max(bestAbove[side], value[side][i]!);
  }
  const first = sideOf(dealer);
  const second = first === "NS" ? "EW" : "NS";
  const forFirst = Math.max(bestAbove[first], -Math.max(bestAbove[second], 0));
  // (+ 0 turns a passed-out −0 into 0.)
  return (first === "NS" ? forFirst : -forFirst) + 0;
}

/** One deal bid once, scored for the defending side (the side facing the weak hand) against par. */
export interface DefenceBoard {
  id: number;
  preemptor: Seat;
  auction: string;
  contract: string;
  declarer: Seat | null;
  /** For the defending side. */
  score: number;
  par: number;
  /** IMPs for the defending side against par (0 is perfect; usually negative). */
  imps: number;
  tags: string[];
  reasons: string[];
  /** With simulation: our hard calls, and how many simulation changed from the rule of thumb. */
  hard?: number;
  overturned?: number;
}

/** Bid a deal with our side's hard calls decided by simulation; the other side bids by its rules. */
async function simulatedAuction(
  hands: Record<Seat, Hand>,
  deal: Pick<BenchDeal, "dealer" | "vul">,
  cards: { NS: SystemSettings; EW: SystemSettings },
  ours: "NS" | "EW",
  solver: DoubleDummySolver,
  options: SimulationOptions,
): Promise<{ decisions: Decision[]; hard: number; overturned: number }> {
  const decisions: Decision[] = [];
  const calls: Call[] = [];
  let hard = 0;
  let overturned = 0;
  for (let i = 0; i < 80 && !isAuctionOver(calls); i++) {
    const seat = SEATS[(SEATS.indexOf(deal.dealer) + calls.length) % 4]!;
    const p = positionAt(deal, calls, cards);
    const rules = decide(p, hands[seat]);
    let d = rules;
    if (sideOf(seat) === ours) {
      d = await decideWithSimulation(p, hands[seat], solver, options, cards);
      if (d.hard) hard++;
      if (callCode(d.call) !== callCode(rules.call)) overturned++;
    }
    decisions.push(d);
    calls.push(d.call);
  }
  return { decisions, hard, overturned };
}

/** The defence board with our hard calls decided by simulation (scored in IMPs by default). */
export async function runDefenceBoardSimulated(deal: WeakDeal, code: string, preemptors: SystemSettings, defenders: SystemSettings, solver: DoubleDummySolver, options: SimulationOptions = { scoring: "imps" }): Promise<DefenceBoard> {
  const side = sideOf(deal.preemptor);
  const ours = side === "NS" ? "EW" : "NS";
  const cards = side === "NS" ? { NS: preemptors, EW: defenders } : { NS: defenders, EW: preemptors };
  const sim = await simulatedAuction(handsOf(deal), deal, cards, ours, solver, options);
  return { ...scoreDefence(deal, code, sim.decisions), hard: sim.hard, overturned: sim.overturned };
}

export function runDefenceBoard(deal: WeakDeal, code: string, preemptors: SystemSettings, defenders: SystemSettings): DefenceBoard {
  const side = sideOf(deal.preemptor);
  const cards = side === "NS" ? { NS: preemptors, EW: defenders } : { NS: defenders, EW: preemptors };
  return scoreDefence(deal, code, sidedAuction(handsOf(deal), deal, cards));
}

/** Score one auction for our side (the side facing the weak hand) against par. */
function scoreDefence(deal: WeakDeal, code: string, decisions: Decision[]): DefenceBoard {
  const hands = handsOf(deal);
  const side = sideOf(deal.preemptor);
  const t = table(deal, code, decisions);
  const parNs = parScore(code, deal.vul, deal.dealer);
  const par = side === "NS" ? -parNs : parNs;
  const score = -t.score;
  const kind = weakKind(hands[deal.preemptor])!;
  const seat = (SEATS.indexOf(deal.preemptor) - SEATS.indexOf(deal.dealer) + 4) % 4;
  return {
    id: deal.id,
    preemptor: deal.preemptor,
    auction: t.auction,
    contract: t.contract,
    declarer: t.declarer,
    score,
    par,
    imps: imps(score - par),
    tags: [
      t.opening === "PASS" ? "No weak opening" : kind.kind === "two" ? "Their weak two" : "Their three-level preempt",
      vulnerable(deal.vul, side) ? "They're vulnerable" : "They're not vulnerable",
      vulnerable(deal.vul, side === "NS" ? "EW" : "NS") ? "We're vulnerable" : "We're not vulnerable",
      ["Weak hand in first seat", "Weak hand in second seat", "Weak hand in third seat"][seat]!,
    ],
    reasons: t.reasons,
  };
}

export interface DefenceRunFile {
  id: string;
  set: string;
  label: string;
  commit: string;
  dirty: boolean;
  createdAt: string;
  ms: number;
  /** The preempting side's card and the defending side's, as changes from SAYC. */
  preemptors: Record<string, string | number | boolean>;
  defenders: Record<string, string | number | boolean>;
  boards: DefenceBoard[];
}

/** The defence run's report, compared with its baseline when there is one. */
export function defenceSummary(run: DefenceRunFile, base: DefenceRunFile | null, top = 10): string {
  const lines: string[] = [];
  const byId = new Map(base?.boards.map((b) => [b.id, b]) ?? []);
  const all = run.boards.map((b) => b.imps);
  lines.push(`Defence against weak openings, set ${run.set} (${run.boards.length} deals)`);
  lines.push(`Run:      ${run.id}  ${run.commit}${run.dirty ? " (with uncommitted changes)" : ""}${run.label ? `  "${run.label}"` : ""}`);
  lines.push(`Cards:    they (the weak hand's side) ${cardText(run.preemptors)}; we ${cardText(run.defenders)}`);
  if (base) lines.push(`Baseline: ${base.id}  ${base.commit}${base.label ? `  "${base.label}"` : ""}`);
  lines.push("");
  lines.push("IMPs per board for us (the side facing the weak hand) against par; 0 is perfect, higher is better");
  if (base) {
    const paired = run.boards.filter((b) => byId.has(b.id));
    const deltas = paired.map((b) => b.imps - byId.get(b.id)!.imps);
    const ci = bootstrapCi(deltas);
    const verdict = ci[0] > 0 ? "better" : ci[1] < 0 ? "worse" : "no clear difference";
    lines.push(`  All boards   this run ${signed(mean(all))}   baseline ${signed(mean(base.boards.map((b) => b.imps)))}   change ${signed(mean(deltas))} (${signed(ci[0])} to ${signed(ci[1])})  ${verdict}`);
  } else {
    const ci = bootstrapCi(all);
    lines.push(`  All boards   ${signed(mean(all))}  (${signed(ci[0])} to ${signed(ci[1])})`);
  }
  const hard = run.boards.reduce((n, b) => n + (b.hard ?? 0), 0);
  if (run.boards.some((b) => b.hard !== undefined)) {
    lines.push(`  Hard calls simulated: ${hard}, of which simulation changed ${run.boards.reduce((n, b) => n + (b.overturned ?? 0), 0)} from the rule of thumb`);
  }
  lines.push("");
  const tagSet = [...new Set(run.boards.flatMap((b) => b.tags))].sort();
  lines.push(`${"By situation".padEnd(40)}${"boards".padStart(7)}${"IMPs/board".padStart(12)}${base ? "change".padStart(9) : ""}`);
  for (const t of tagSet) {
    const bs = run.boards.filter((b) => b.tags.includes(t));
    const m = mean(bs.map((b) => b.imps));
    const was = bs.filter((b) => byId.has(b.id)).map((b) => byId.get(b.id)!.imps);
    lines.push(`  ${t.padEnd(38)}${String(bs.length).padStart(7)}${signed(m).padStart(12)}${base ? signed(m - mean(was)).padStart(9) : ""}`);
  }
  lines.push("");
  if (base) {
    const changed = run.boards.filter((b) => byId.has(b.id) && byId.get(b.id)!.auction !== b.auction);
    lines.push(`Changed auctions: ${changed.length}`);
    for (const b of changed.sort((x, y) => Math.abs(y.imps - byId.get(y.id)!.imps) - Math.abs(x.imps - byId.get(x.id)!.imps)).slice(0, top)) {
      const o = byId.get(b.id)!;
      lines.push(`  Board ${String(b.id).padStart(4)}  ${`${o.contract} ${o.declarer ?? ""}`.padEnd(8)} → ${`${b.contract} ${b.declarer ?? ""}`.padEnd(8)} ${signed(b.imps - o.imps, 0).padStart(4)} IMPs`);
    }
    lines.push("");
  }
  lines.push("Costliest boards for us");
  for (const b of [...run.boards].sort((x, y) => x.imps - y.imps).slice(0, top)) {
    lines.push(`  Board ${String(b.id).padStart(4)}  ${`${b.contract} ${b.declarer ?? ""}`.padEnd(8)} score ${String(b.score).padStart(6)}  par ${String(b.par).padStart(6)}  ${signed(b.imps, 0).padStart(4)} IMPs  ${b.tags[0]}`);
  }
  return lines.join("\n");
}

// ---- The judgment check: today's simulation against the old, on ordinary deals -------------------

/** How the bots simulated before judgment mode: matchpoints, only the calls the rules flag, each the last call. */
export const OLD_SIMULATION: SimulationOptions = { scoring: "matchpoints" };

export interface JudgmentBoard {
  id: number;
  /** IMPs for the side using the new options, over the two tables (as in a teams match). */
  imps: number;
  /** Table 1: new North–South; table 2: new East–West. */
  tables: [WeakTable, WeakTable];
  /** Both sides bid at some point in either auction. */
  contested: boolean;
}

/** One deal at two tables: the new options North–South, then East–West; scored as a teams match. */
export async function runJudgmentBoard(deal: WeakDeal, code: string, card: SystemSettings, solver: DoubleDummySolver, next: SimulationOptions, old: SimulationOptions = OLD_SIMULATION): Promise<JudgmentBoard> {
  const hands = handsOf(deal);
  const cards = { NS: card, EW: card };
  const auction = async (nsOptions: SimulationOptions, ewOptions: SimulationOptions) => {
    const decisions: Decision[] = [];
    const calls: Call[] = [];
    for (let i = 0; i < 80 && !isAuctionOver(calls); i++) {
      const seat = SEATS[(SEATS.indexOf(deal.dealer) + calls.length) % 4]!;
      const p = positionAt(deal, calls, cards);
      const d = await decideWithSimulation(p, hands[seat], solver, sideOf(seat) === "NS" ? nsOptions : ewOptions, cards);
      decisions.push(d);
      calls.push(d.call);
    }
    return decisions;
  };
  // Scored for North–South (table() scores for the preemptor's side; the dealer stands in as North–South here).
  const nsTable = async (ns: SimulationOptions, ew: SimulationOptions) => {
    const t = table({ ...deal, preemptor: "N" }, code, await auction(ns, ew));
    return t;
  };
  const one = await nsTable(next, old);
  const two = await nsTable(old, next);
  const bidders = (t: WeakTable) => new Set(t.auction.split(" ").map((c, i) => (c !== "PASS" && c !== "X" && c !== "XX" ? sideOf(SEATS[(SEATS.indexOf(deal.dealer) + i) % 4]!) : null)).filter(Boolean));
  return { id: deal.id, imps: imps(one.score - two.score), tables: [one, two], contested: bidders(one).size === 2 || bidders(two).size === 2 };
}

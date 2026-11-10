// Simulation for hard calls: when the rules don't settle a call (compete, double or pass?), deal
// many hands that fit what the auction has shown, see how each candidate call would score with
// double dummy, and choose the one that does best at matchpoints.
//
// Fair: it knows the bot's own hand, the auction (what each call showed) and nothing else.
// Repeatable: the deals are seeded from the hand and the auction, so the review can run it again and
// get the same answer the bot got at the table.
//
// The simplification, for now: each candidate is treated as the last call of the auction (everyone
// passes after it). That fits the decisions marked hard (compete one more, double, or pass, late in
// a contested auction); it would not fit an early, constructive call.

import { type Call, auctionResult, canCall, isAuctionOver } from "../auction";
import type { DoubleDummyJob, DoubleDummySolver } from "../doubleDummy";
import { scoreFor, scoreResult } from "../scoring";
import { type Hand, type Seat, type TableResult, RANKS, SEATS, SUITS, directionOf } from "../types";
import type { Shown } from "./model";
import type { Position } from "./position";

export interface SimulationResult {
  call: Call;
  /** Share of the matchpoints among the candidates, 0–1, over all deals. */
  share: number;
  /** Average score for our side. */
  average: number;
}

export interface Simulation {
  /** How many deals fit the auction and were scored. */
  deals: number;
  /** One line per candidate, best first. */
  results: SimulationResult[];
  best: Call;
}

export interface SimulationOptions {
  /** Deals to score (fewer if not enough fit the auction). */
  deals?: number;
  /** Give up looking for deals after this many tries. */
  maxTries?: number;
  /** Fewer deals than this that fit the auction: no simulation, the rule of thumb stands. */
  minDeals?: number;
}

const HCP: Record<string, number> = { A: 4, K: 3, Q: 2, J: 1 };

/** A small seeded random generator (mulberry32). */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A 32-bit hash of a string (FNV-1a), for the seed. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

const handKey = (h: Hand) => SUITS.map((s) => h[s]).join(".");
const callKey = (c: Call) => (c.kind === "bid" ? `${c.level}${c.strain}` : c.kind);

/** Does a dealt hand fit what its seat has shown? */
function fits(cards: number[], shown: Shown): boolean {
  let hcp = 0;
  const len = [0, 0, 0, 0];
  for (const c of cards) {
    len[Math.floor(c / 13)]!++;
    hcp += HCP[RANKS[c % 13]!] ?? 0;
  }
  if (hcp < shown.hcp[0] || hcp > shown.hcp[1]) return false;
  for (let s = 0; s < 4; s++) {
    const r = shown.len[SUITS[s]!];
    if (len[s]! < r[0] || len[s]! > r[1]) return false;
  }
  if (shown.balanced) {
    const shape = [...len].sort((a, b) => b - a).join("");
    if (!["4333", "4432", "5332", "5422", "6322"].includes(shape)) return false;
  }
  return true;
}

function toHand(cards: number[]): Hand {
  const hand = { S: "", H: "", D: "", C: "" } as Hand;
  for (const c of [...cards].sort((a, b) => a - b)) hand[SUITS[Math.floor(c / 13)]!] += RANKS[c % 13];
  return hand;
}

/**
 * Deals that fit the auction: my hand as it is, the other three dealt at random from the rest and
 * kept only if each fits what that seat has shown (its HCP range, suit lengths, balanced or not).
 */
export function dealsFittingAuction(p: Position, mine: Hand, count: number, maxTries: number, rand: () => number): Record<Seat, Hand>[] {
  const held = new Set<number>();
  SUITS.forEach((s, si) => [...mine[s]].forEach((r) => held.add(si * 13 + RANKS.indexOf(r))));
  const rest = Array.from({ length: 52 }, (_, i) => i).filter((i) => !held.has(i));
  const others = SEATS.filter((s) => s !== p.seat);
  const out: Record<Seat, Hand>[] = [];
  for (let tries = 0; tries < maxTries && out.length < count; tries++) {
    for (let i = rest.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [rest[i], rest[j]] = [rest[j]!, rest[i]!];
    }
    const split = others.map((_, k) => rest.slice(k * 13, k * 13 + 13));
    if (!others.every((seat, k) => fits(split[k]!, p.shown[seat]))) continue;
    const deal = { [p.seat]: mine } as Record<Seat, Hand>;
    others.forEach((seat, k) => (deal[seat] = toHand(split[k]!)));
    out.push(deal);
  }
  return out;
}

/** The contract the auction ends in if this call is the last one (everyone passes after it). */
function finalContract(p: Position, call: Call) {
  const calls = [...p.calls, call];
  while (!isAuctionOver(calls)) calls.push({ kind: "pass" });
  return auctionResult(p.dealer, calls)!;
}

/**
 * Simulate a hard call: how each candidate scores, at matchpoints against the others, over deals
 * that fit the auction. Null when too few deals fit (the rule of thumb stands).
 */
export async function simulateHardCall(
  p: Position,
  mine: Hand,
  candidates: Call[],
  solver: DoubleDummySolver,
  options: SimulationOptions = {},
): Promise<Simulation | null> {
  const legal = candidates.filter((c, i) => canCall(p.dealer, p.calls, c) && candidates.findIndex((d) => callKey(d) === callKey(c)) === i);
  if (legal.length < 2) return null;
  const rand = seeded(hash(`${handKey(mine)}|${p.dealer}|${p.vul}|${p.calls.map(callKey).join(" ")}`));
  const deals = dealsFittingAuction(p, mine, options.deals ?? 60, options.maxTries ?? 40_000, rand);
  if (deals.length < (options.minDeals ?? 16)) return null;

  // Each candidate's final contract, and one solve per distinct contract per deal.
  const finals = legal.map((c) => finalContract(p, c));
  const jobs: DoubleDummyJob[] = [];
  const jobIndex = new Map<string, number>();
  deals.forEach((hands, d) =>
    finals.forEach((f) => {
      if (!f.contract || !f.declarer) return;
      const key = `${d}|${f.contract.strain}|${f.declarer}`;
      if (!jobIndex.has(key)) {
        jobIndex.set(key, jobs.length);
        jobs.push({ hands, strain: f.contract.strain, declarer: f.declarer });
      }
    }),
  );
  const tricks = await solver.tricks(jobs);

  const side = directionOf(p.seat);
  const scores = deals.map((_, d) =>
    finals.map((f) => {
      if (!f.contract || !f.declarer) return 0;
      const result: TableResult = { contract: f.contract, declarer: f.declarer, tricks: tricks[jobIndex.get(`${d}|${f.contract.strain}|${f.declarer}`)!]! };
      const declarer = scoreResult(result, p.vul).declarerScore;
      return scoreFor(side, directionOf(f.declarer) === "NS" ? declarer : -declarer);
    }),
  );

  // Matchpoints among the candidates on each deal: 1 for each candidate beaten, ½ for each tie.
  const k = legal.length;
  const results: SimulationResult[] = legal.map((call, i) => {
    let mp = 0;
    let total = 0;
    for (const row of scores) {
      total += row[i]!;
      for (let j = 0; j < k; j++) if (j !== i) mp += row[i]! > row[j]! ? 1 : row[i] === row[j] ? 0.5 : 0;
    }
    return { call, share: mp / (deals.length * (k - 1)), average: total / deals.length };
  });
  const order = [...results].sort((a, b) => b.share - a.share);
  return { deals: deals.length, results: order, best: order[0]!.call };
}

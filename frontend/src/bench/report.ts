// What the harness prints: a run's summary (against its baseline, when there is one) and one board
// in full. Plain text for the terminal. Lower loss is better, so a negative change is an improvement.

import { parseCall } from "../core/auction";
import { callName } from "../core/bidding/sayc/common";
import { parseContract } from "../core/contract";
import { type Hand, type Seat, SEATS, SUITS, SUIT_SYMBOLS } from "../core/types";
import { seeded } from "../core/random";
import { type BenchDeal, handsOf } from "./deals";
import { CLASS_NAMES, contractOptions, expectedLoss, optionFor, optionText } from "./ideal";
import type { BoardResult } from "./stage1";

export interface RunInfo {
  /** "<set>-<date>-<time>". */
  id: string;
  set: string;
  label: string;
  commit: string;
  /** The working tree had uncommitted changes. */
  dirty: boolean;
  createdAt: string;
  ms: number;
}

export interface RunFile extends RunInfo {
  boards: BoardResult[];
}

/** 95% confidence interval for the mean, by bootstrap over the values (seeded, so it repeats). */
export function bootstrapCi(values: number[], samples = 2000, seed = 20261125): [number, number] {
  if (values.length === 0) return [0, 0];
  const rand = seeded(seed);
  const means: number[] = [];
  for (let k = 0; k < samples; k++) {
    let sum = 0;
    for (let i = 0; i < values.length; i++) sum += values[Math.floor(rand() * values.length)]!;
    means.push(sum / values.length);
  }
  means.sort((a, b) => a - b);
  return [means[Math.floor(samples * 0.025)]!, means[Math.floor(samples * 0.975)]!];
}

export type Verdict = "better" | "worse" | "no clear difference";

/** Paired comparison of losses on the same boards: the mean change, its interval, and a verdict. */
export function compareLosses(now: number[], before: number[]): { change: number; ci: [number, number]; verdict: Verdict } {
  const deltas = now.map((x, i) => x - before[i]!);
  const change = mean(deltas);
  const ci = bootstrapCi(deltas);
  const verdict: Verdict = ci[1] < 0 ? "better" : ci[0] > 0 ? "worse" : "no clear difference";
  return { change, ci, verdict };
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const minus = (s: string) => s.replace("-", "−");
const fixed = (n: number, d = 2) => minus(n.toFixed(d));
const signed = (n: number, d = 2) => (Math.abs(n) < 0.5 * 10 ** -d ? (0).toFixed(d) : n > 0 ? `+${n.toFixed(d)}` : minus(n.toFixed(d)));
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const pad = (s: string, n: number) => s.padEnd(n);
const lpad = (s: string, n: number) => s.padStart(n);

export interface SummaryOptions {
  /** How many costly boards and changed boards to list. */
  top: number;
  /** List every changed board, not just the top. */
  allChanged: boolean;
  /** Situations with fewer boards than this aren't listed. */
  minBoards: number;
  deals: number;
}

function runLine(r: RunInfo): string {
  return `${r.id}  ${r.commit}${r.dirty ? " (with uncommitted changes)" : ""}${r.label ? `  "${r.label}"` : ""}`;
}

const contractText = (b: Pick<BoardResult, "contract" | "declarer">) => optionText({ contract: parseContract(b.contract), declarer: b.declarer });
const idealText = (b: BoardResult) => optionText({ contract: parseContract(b.ideal), declarer: b.idealDeclarer });

/** The run's summary, compared with the baseline when there is one. */
export function summary(run: RunFile, base: RunFile | null, o: SummaryOptions): string {
  const lines: string[] = [];
  const byId = new Map(base?.boards.map((b) => [b.id, b]) ?? []);
  const paired = base ? run.boards.filter((b) => byId.has(b.id)) : [];
  const baseOf = (b: BoardResult) => byId.get(b.id)!;

  lines.push(`Set ${run.set} (${o.deals} deals, stage 1: bidding with the opponents silent)`);
  lines.push(`Run:      ${runLine(run)}`);
  lines.push(base ? `Baseline: ${runLine(base)}` : "No baseline yet. Make this run the baseline with: npm run bench -- baseline " + run.set);
  lines.push("");

  // Headline.
  const losses = run.boards.map((b) => b.loss);
  const atIdeal = (bs: BoardResult[]) => bs.filter((b) => b.contract === b.ideal && b.declarer === b.idealDeclarer).length / bs.length;
  const big = (bs: BoardResult[]) => bs.filter((b) => b.loss >= 3).length / bs.length;
  lines.push("Loss against the ideal contract (IMPs per board; lower is better)");
  if (base) {
    const cmp = compareLosses(paired.map((b) => b.loss), paired.map((b) => baseOf(b).loss));
    lines.push(`  ${pad("", 26)}${lpad("this run", 10)}${lpad("baseline", 10)}    change`);
    lines.push(`  ${pad("All boards", 26)}${lpad(fixed(mean(losses)), 10)}${lpad(fixed(mean(base.boards.map((b) => b.loss))), 10)}    ${signed(cmp.change)} (${fixed(cmp.ci[0])} to ${fixed(cmp.ci[1])})  ${cmp.verdict}`);
    lines.push(`  ${pad("At the ideal contract", 26)}${lpad(pct(atIdeal(run.boards)), 10)}${lpad(pct(atIdeal(base.boards)), 10)}`);
    lines.push(`  ${pad("Losing 3+ IMPs", 26)}${lpad(pct(big(run.boards)), 10)}${lpad(pct(big(base.boards)), 10)}`);
  } else {
    const ci = bootstrapCi(losses);
    lines.push(`  ${pad("All boards", 26)}${lpad(fixed(mean(losses)), 8)}  (${fixed(ci[0])} to ${fixed(ci[1])})`);
    lines.push(`  ${pad("At the ideal contract", 26)}${lpad(pct(atIdeal(run.boards)), 8)}`);
    lines.push(`  ${pad("Losing 3+ IMPs", 26)}${lpad(pct(big(run.boards)), 8)}`);
  }
  lines.push("");

  // Breakdowns: by the ideal's level, by kind of miss, by situation.
  const group = (title: string, keys: string[], pick: (b: BoardResult) => string[], cols: "loss" | "imps") => {
    lines.push(`${pad(title, 44)}${lpad("boards", 7)}${lpad(cols === "loss" ? "loss" : "IMPs lost", 11)}${base ? lpad("change", 9) : ""}`);
    for (const key of keys) {
      const now = run.boards.filter((b) => pick(b).includes(key));
      if (now.length === 0) continue;
      const value = cols === "loss" ? mean(now.map((b) => b.loss)) : sum(now.map((b) => b.loss));
      let change = "";
      if (base) {
        const was = cols === "loss" ? now.filter((b) => byId.has(b.id)).map((b) => baseOf(b).loss) : base.boards.filter((b) => pick(b).includes(key)).map((b) => b.loss);
        change = lpad(signed(cols === "loss" ? value - mean(was) : value - sum(was), cols === "loss" ? 2 : 0), 9);
      }
      lines.push(`  ${pad(key, 42)}${lpad(String(now.length), 7)}${lpad(fixed(value, cols === "loss" ? 2 : 0), 11)}${change}`);
    }
    lines.push("");
  };
  group("By the ideal contract's level", [...CLASS_NAMES], (b) => [b.idealClass], "loss");
  group("How the contract missed the ideal", ["Too low", "Too high", "Wrong strain", "Wrong declarer"], (b) => [b.miss], "imps");

  const tagCounts = new Map<string, number>();
  for (const b of run.boards) for (const t of b.tags) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
  const tagLoss = (t: string) => mean(run.boards.filter((b) => b.tags.includes(t)).map((b) => b.loss));
  const tags = [...tagCounts].filter(([, n]) => n >= o.minBoards).map(([t]) => t).sort((a, b) => tagLoss(b) - tagLoss(a));
  group(`By situation, worst first (${o.minBoards}+ boards)`, tags, (b) => b.tags, "loss");

  // Boards.
  if (base) {
    const changed = paired.filter((b) => b.auction !== baseOf(b).auction);
    const contractChanged = changed.filter((b) => b.contract !== baseOf(b).contract || b.declarer !== baseOf(b).declarer);
    const delta = (b: BoardResult) => b.loss - baseOf(b).loss;
    const better = contractChanged.filter((b) => delta(b) < -0.05).length;
    const worse = contractChanged.filter((b) => delta(b) > 0.05).length;
    lines.push(`Changed auctions: ${changed.length}, of which ${contractChanged.length} reached a different contract (better ${better}, worse ${worse}, about the same ${contractChanged.length - better - worse})`);
    const list = [...contractChanged].sort((a, b) => Math.abs(delta(b)) - Math.abs(delta(a)));
    for (const b of o.allChanged ? list : list.slice(0, o.top)) {
      lines.push(`  Board ${lpad(String(b.id), 4)}  ${pad(contractText(baseOf(b)), 13)} → ${pad(contractText(b), 13)} ${lpad(signed(-delta(b), 1), 6)} IMPs   ideal ${idealText(b)}`);
    }
    if (!o.allChanged && list.length > o.top) lines.push(`  … and ${list.length - o.top} more (--changed lists them all)`);
    lines.push("");
  }
  lines.push(`Costliest boards`);
  for (const b of [...run.boards].sort((a, c) => c.loss - a.loss).slice(0, o.top)) {
    lines.push(`  Board ${lpad(String(b.id), 4)}  ${pad(contractText(b), 13)} ideal ${pad(idealText(b), 13)} ${lpad(fixed(b.loss, 1), 5)} IMPs  ${pad(b.miss, 15)} ${b.tags[0] ?? ""}`);
  }
  lines.push("");

  const fallbacks = sum(run.boards.map((b) => b.fallbacks));
  lines.push(`Calls with no rule: ${fallbacks}${base ? ` (baseline ${sum(base.boards.map((b) => b.fallbacks))})` : ""}    Time: ${(run.ms / 1000).toFixed(1)} s`);
  lines.push(`One board in full: npm run bench -- show ${run.id} --board <number>`);
  return lines.join("\n");
}

const handText = (h: Hand) => SUITS.map((s) => `${SUIT_SYMBOLS[s]}${h[s] || "—"}`).join(" ");

/** One board in full: the hands, the auction with reasons, and the ideal table. */
export function boardText(deal: BenchDeal, layouts: string[], b: BoardResult, run: RunInfo, rows = 10): string {
  const hands = handsOf(deal);
  const lines: string[] = [];
  lines.push(`Board ${deal.id}  dealer ${deal.dealer}  vulnerable: ${deal.vul}    (${run.id})`);
  for (const s of SEATS) lines.push(`  ${s}  ${handText(hands[s])}${s === "E" || s === "W" ? "   (silent)" : ""}`);
  lines.push("");
  lines.push("Auction");
  const calls = b.auction.split(" ").map((c) => parseCall(c)!);
  const seatAt = (i: number): Seat => SEATS[(SEATS.indexOf(deal.dealer) + i) % 4]!;
  calls.forEach((c, i) => {
    const seat = seatAt(i);
    const reason = seat === "E" || seat === "W" ? "" : b.reasons?.[i] ?? "";
    lines.push(`  ${seat}  ${pad(callName(c), 9)}${reason}`);
  });
  if (!b.reasons) lines.push("  (this run file has no reasons; run the code again to see them)");
  lines.push("");
  lines.push(`Contract: ${contractText(b)}    Ideal: ${idealText(b)}    Expected loss: ${fixed(b.loss)} IMPs (${b.miss})`);
  lines.push("");
  lines.push(`Each contract over ${layouts.length} layouts of East–West's cards, best first`);
  const options = contractOptions(layouts, deal.vul);
  const ideal = options[0]!;
  const bot = optionFor(options, parseContract(b.contract), b.declarer);
  const shown = options.slice(0, rows);
  if (!shown.includes(bot)) shown.push(bot);
  lines.push(`  ${pad("Contract", 14)}${lpad("average", 9)}${lpad("loss", 8)}`);
  for (const opt of shown) {
    const mark = opt === ideal ? "  ideal" : "";
    const botMark = opt === bot ? "  ← the bots' contract" : "";
    lines.push(`  ${pad(optionText(opt), 14)}${lpad(signed(opt.mean, 0), 9)}${lpad(fixed(expectedLoss(ideal, opt), 1), 8)}${mark}${botMark}`);
  }
  return lines.join("\n");
}

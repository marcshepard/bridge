// The evaluation harness (docs/HARNESS.md), stage 1: the bots' bidding with the opponents silent,
// scored against the ideal contract for North–South's two hands.
//
//   npm run bench -- build <set> [--deals 1000 --seed 1 --layouts 50]   deal a set and solve its layouts (once)
//   npm run bench -- run <set> [--label "what changed"]                 bid every deal, compare with the baseline
//   npm run bench -- run <set> --card blackwood=rkc1430                 the same with settings changed from the SAYC defaults
//   npm run bench -- baseline <set> [<run>]                             make a run (default: the latest) the baseline
//   npm run bench -- compare <run> [<other run>]                        compare two runs (default: with the baseline)
//   npm run bench -- show <run> --board <n>                             one board in full
//   npm run bench -- list                                               sets, baselines and runs
//
// The weak-opening experiment (stage 2): a variant card for the side with a weak two or preempt hand.
//   npm run bench -- weak-build <set> [--deals 1500 --seed 101]         deal a set and solve each deal (once)
//   npm run bench -- weak-run <set> --card weakTwoSuit=decent           IMPs for the variant against the base
//   npm run bench -- weak-run <set> --base k=v --card k=v               a base other than SAYC
//   npm run bench -- weak-show <run> --board <n>                        one board in full, both auctions
//   npm run bench -- weak-defence <set> [--card k=v]                    our bidding against their weak openings (3+ HCP suits), against par
//   npm run bench -- weak-defence-baseline <set> [<run>]                make a defence run (default: the latest) the set's baseline
//
// A run can be named by its id, or as "latest" or "baseline" (with --set when there's more than
// one set). Options for run and compare: --top <n> boards to list (10), --changed (list every
// changed board), --min-boards <n> for a situation to be listed (15).
//
// Set definitions and baselines are kept in bench/ (committed). The dealt boards, solved layouts and
// run files are in bench/.cache/ (not committed; rebuilt exactly from the definitions).
//
// Run from frontend/. Bundled with rolldown first, like the bidding report. Building a set's cache
// uses worker threads, one copy of the double-dummy solver each.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { resolve } from "node:path";
import { Worker, isMainThread, parentPort } from "node:worker_threads";
import { type BenchDeal, type SetDefinition, DEFAULT_SET, dealSet, ewLayouts, handsOf } from "../src/bench/deals";
import { encodeTricks } from "../src/bench/ideal";
import { type RunFile, boardText, summary } from "../src/bench/report";
import { type BoardResult, runBoard } from "../src/bench/stage1";
import { SyncSolver } from "../src/dds/syncSolver";
import { SAYC_DEFAULTS, type SystemSettings } from "../src/core/bidding/system";
import { type DefenceRunFile, type WeakDeal, type WeakRunFile, type WeakSetDefinition, DEFAULT_WEAK_SET, defenceSummary, encodeTable, runDefenceBoard, runWeakBoard, weakBoardText, weakDealSet, weakSummary } from "../src/bench/weak";

interface Cache {
  definition: SetDefinition;
  deals: BenchDeal[];
  /** Per deal, per layout: North's and South's tricks in each strain (see encodeTricks). */
  layouts: string[][];
}

interface LayoutJob {
  deal: BenchDeal;
  def: SetDefinition;
}

interface LayoutDone {
  id: number;
  layouts: string[];
}

/** The weak-opening experiment: its deals and each deal's double-dummy table (see weak.ts). */
interface WeakCache {
  definition: WeakSetDefinition;
  deals: WeakDeal[];
  tables: string[];
}

interface TableJob {
  table: WeakDeal;
}

// ---- Files ------------------------------------------------------------------------------------

const BENCH = resolve("bench");
const CACHE = resolve(BENCH, ".cache");
const RUNS = resolve(CACHE, "runs");
const SETS_FILE = resolve(BENCH, "sets.json");
const BASELINES_FILE = resolve(BENCH, "baselines.json");

const readJson = <T>(path: string, fallback: T): T => (existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as T) : fallback);
const writeJson = (path: string, value: unknown, compact = false) => {
  mkdirSync(resolve(path, ".."), { recursive: true });
  writeFileSync(path, (compact ? JSON.stringify(value) : JSON.stringify(value, null, 2)) + "\n");
};
const readSets = () => readJson<Record<string, SetDefinition>>(SETS_FILE, {});
const WEAK_SETS_FILE = resolve(BENCH, "weak-sets.json");
const readWeakSets = () => readJson<Record<string, WeakSetDefinition>>(WEAK_SETS_FILE, {});
const readBaselines = () => readJson<Record<string, RunFile>>(BASELINES_FILE, {});
const cachePath = (set: string) => resolve(CACHE, `${set}.json`);
const runPath = (id: string) => resolve(RUNS, `${id}.json`);

function runIds(set?: string): string[] {
  if (!existsSync(RUNS)) return [];
  return readdirSync(RUNS)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.slice(0, -5))
    .filter((id) => !set || id.startsWith(`${set}-`))
    .sort();
}

// ---- Arguments --------------------------------------------------------------------------------

function parseArgs(argv: string[]) {
  const positional: string[] = [];
  const flags = new Map<string, string | true>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith("--")) {
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        flags.set(a.slice(2), next);
        i++;
      } else flags.set(a.slice(2), true);
    } else positional.push(a);
  }
  const num = (name: string, fallback: number) => {
    const v = flags.get(name);
    if (v === undefined) return fallback;
    const n = Number(v);
    if (!Number.isInteger(n) || n < 0) throw new Error(`--${name} needs a whole number`);
    return n;
  };
  const str = (name: string) => {
    const v = flags.get(name);
    return typeof v === "string" ? v : undefined;
  };
  return { positional, flags, num, str };
}

type Args = ReturnType<typeof parseArgs>;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const [command, ...rest] = args.positional;
  switch (command) {
    case "build":
      return void (await build(need(rest[0], "the set's name"), args));
    case "run":
      return run(need(rest[0], "the set's name"), args);
    case "baseline":
      return baseline(need(rest[0], "the set's name"), rest[1]);
    case "compare":
      return compare(need(rest[0], "a run"), rest[1], args);
    case "show":
      return show(need(rest[0], "a run"), args);
    case "list":
      return list();
    case "weak-build":
      return void (await weakBuild(need(rest[0], "the set's name"), args));
    case "weak-run":
      return weakRun(need(rest[0], "the set's name"), args);
    case "weak-show":
      return weakShow(need(rest[0], "a run"), args);
    case "weak-defence":
      return weakDefence(need(rest[0], "the set's name"), args);
    case "weak-defence-baseline":
      return weakDefenceBaseline(need(rest[0], "the set's name"), rest[1]);
    default:
      console.log(USAGE);
  }
}

const USAGE = `The bots' evaluation harness (docs/HARNESS.md), stage 1: bidding with the opponents silent.

  npm run bench -- build <set> [--deals 1000 --seed 1 --layouts 50]   deal a set and solve its layouts (once)
  npm run bench -- run <set> [--label "what changed"]                 bid every deal, compare with the baseline
  npm run bench -- run <set> --card blackwood=rkc1430                 the same with settings changed from the SAYC defaults
  npm run bench -- baseline <set> [<run>]                             make a run (default: the latest) the baseline
  npm run bench -- compare <run> [<other run>]                        compare two runs (default: with the baseline)
  npm run bench -- show <run> --board <n>                             one board in full
  npm run bench -- list                                               sets, baselines and runs

The weak-opening experiment (stage 2): a variant card for the side with a weak two or preempt hand.
  npm run bench -- weak-build <set> [--deals 1500 --seed 101]         deal a set and solve each deal (once)
  npm run bench -- weak-run <set> --card weakTwoSuit=decent           IMPs for the variant against the base
  npm run bench -- weak-run <set> --base k=v --card k=v               a base other than SAYC
  npm run bench -- weak-show <run> --board <n>                        one board in full, both auctions
  npm run bench -- weak-defence <set> [--card k=v]                    our bidding against their weak openings (3+ HCP suits), against par
  npm run bench -- weak-defence-baseline <set> [<run>]                make a defence run (default: the latest) the set's baseline

A run is named by its id, or "latest" or "baseline" (add --set <name> when there's more than one set).
For run and compare: --top <n> boards to list (10), --changed to list every changed board,
--min-boards <n> boards for a situation to be listed (15).`;

function need(value: string | undefined, what: string): string {
  if (!value) throw new Error(`Give ${what}. Run "npm run bench" for the commands.`);
  return value;
}

// ---- build ------------------------------------------------------------------------------------

async function build(set: string, args: Args): Promise<Cache> {
  const sets = readSets();
  const asked: SetDefinition = {
    ...DEFAULT_SET,
    deals: args.num("deals", sets[set]?.deals ?? DEFAULT_SET.deals),
    seed: args.num("seed", sets[set]?.seed ?? DEFAULT_SET.seed),
    layouts: args.num("layouts", sets[set]?.layouts ?? DEFAULT_SET.layouts),
  };
  const def = sets[set];
  if (def && JSON.stringify(def) !== JSON.stringify(asked)) {
    throw new Error(`Set "${set}" already exists as ${JSON.stringify(def)}. Use a new name for a different set.`);
  }
  if (!def) {
    writeJson(SETS_FILE, { ...sets, [set]: asked });
    console.log(`New set "${set}": ${JSON.stringify(asked)}`);
  }
  const cached = readJson<Cache | null>(cachePath(set), null);
  if (cached && JSON.stringify(cached.definition) === JSON.stringify(asked)) {
    console.log(`Set "${set}" is already built (${cached.deals.length} deals).`);
    return cached;
  }

  const deals = dealSet(asked);
  const threads = Math.max(1, Math.min(args.num("threads", availableParallelism() - 2), deals.length));
  console.log(`Building "${set}": ${deals.length} deals × ${asked.layouts} layouts, on ${threads} threads…`);
  const started = Date.now();
  const layouts = new Map<number, string[]>();
  await new Promise<void>((done, fail) => {
    let next = 0;
    const workers = Array.from({ length: threads }, () => new Worker(new URL(import.meta.url)));
    const send = (w: Worker) => {
      if (next < deals.length) w.postMessage({ deal: deals[next++]!, def: asked } satisfies LayoutJob);
    };
    for (const w of workers) {
      w.on("error", fail);
      w.on("message", (m: LayoutDone) => {
        layouts.set(m.id, m.layouts);
        const n = layouts.size;
        if (n % 20 === 0 || n === deals.length) {
          const secs = (Date.now() - started) / 1000;
          const left = Math.round((secs / n) * (deals.length - n));
          process.stdout.write(`\r  ${n} of ${deals.length} deals, about ${left} s to go   `);
        }
        if (n === deals.length) {
          process.stdout.write("\n");
          void Promise.all(workers.map((x) => x.terminate())).then(() => done());
        } else send(w);
      });
      send(w);
    }
  });
  const cache: Cache = { definition: asked, deals, layouts: deals.map((d) => layouts.get(d.id)!) };
  writeJson(cachePath(set), cache, true);
  console.log(`Built in ${Math.round((Date.now() - started) / 1000)} s.`);
  return cache;
}

function loadCache(set: string): Cache {
  const cache = readJson<Cache | null>(cachePath(set), null);
  const def = readSets()[set];
  if (!def) throw new Error(`No set called "${set}". Make it with: npm run bench -- build ${set}`);
  if (!cache || JSON.stringify(cache.definition) !== JSON.stringify(def)) {
    throw new Error(`Set "${set}" isn't built on this computer yet. Build it with: npm run bench -- build ${set}`);
  }
  return cache;
}

// ---- run, baseline, compare, show, list ----------------------------------------------------------

function git(...args: string[]): string {
  try {
    return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}

function stamp(d: Date): string {
  const two = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}-${two(d.getHours())}${two(d.getMinutes())}${two(d.getSeconds())}`;
}

const options = (args: Args, deals: number) => ({
  top: args.num("top", 10),
  allChanged: args.flags.has("changed"),
  minBoards: args.num("min-boards", 15),
  deals,
});

async function run(set: string, args: Args) {
  if (!readSets()[set] || !existsSync(cachePath(set))) await build(set, args);
  const cache = loadCache(set);
  const started = Date.now();
  const card = parseCard(args.str("card"));
  const settings = { ...SAYC_DEFAULTS, ...card } as SystemSettings;
  const boards: BoardResult[] = cache.deals.map((d, i) => runBoard(d, cache.layouts[i]!, true, settings));
  const now = new Date();
  const result: RunFile = {
    id: `${set}-${stamp(now)}`,
    set,
    label: args.str("label") ?? "",
    commit: git("rev-parse", "--short", "HEAD") || "unknown",
    // Uncommitted changes anywhere in the repo, except the harness's own files in bench/.
    dirty: git("status", "--porcelain", "--", ":/", ":(exclude,top)frontend/bench").length > 0,
    createdAt: now.toISOString(),
    ms: Date.now() - started,
    ...(Object.keys(card).length > 0 && { card }),
    boards,
  };
  writeJson(runPath(result.id), result, true);
  console.log(summary(result, readBaselines()[set] ?? null, options(args, cache.deals.length)));
}

/** "--card blackwood=rkc1430,jacoby2nt=false": settings changed from the SAYC defaults. */
function parseCard(text: string | undefined): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const pair of (text ?? "").split(",").filter(Boolean)) {
    const [key, raw] = pair.split("=");
    if (!key || raw === undefined || !(key in SAYC_DEFAULTS)) {
      throw new Error(`--card: "${pair}" isn't a setting. Settings: ${Object.keys(SAYC_DEFAULTS).join(", ")}`);
    }
    const def = SAYC_DEFAULTS[key as keyof SystemSettings];
    out[key] = typeof def === "boolean" ? raw === "true" : typeof def === "number" ? Number(raw) : raw;
  }
  return out;
}

function resolveRun(ref: string, set?: string): RunFile {
  const onlySet = () => {
    if (set) return set;
    const sets = Object.keys(readSets());
    if (sets.length === 1) return sets[0]!;
    throw new Error(`Say which set with --set (${sets.join(", ")}).`);
  };
  if (ref === "baseline") {
    const s = onlySet();
    const b = readBaselines()[s];
    if (!b) throw new Error(`Set "${s}" has no baseline yet.`);
    return b;
  }
  if (ref === "latest") {
    const s = onlySet();
    const id = runIds(s).at(-1);
    if (!id) throw new Error(`Set "${s}" has no runs yet.`);
    return readJson<RunFile>(runPath(id), null as never);
  }
  if (existsSync(runPath(ref))) return readJson<RunFile>(runPath(ref), null as never);
  const baseline = Object.values(readBaselines()).find((b) => b.id === ref);
  if (baseline) return baseline;
  throw new Error(`No run called "${ref}". "npm run bench -- list" shows the runs.`);
}

function baseline(set: string, ref?: string) {
  const r = resolveRun(ref ?? "latest", set);
  if (r.set !== set) throw new Error(`Run ${r.id} is for set "${r.set}", not "${set}".`);
  // A smaller copy: everything but the reasons, so it can be committed.
  const boards = r.boards.map(({ reasons: _, ...b }) => b);
  writeBaselines({ ...readBaselines(), [set]: { ...r, boards } });
  console.log(`Baseline for "${set}" is now ${r.id} (${r.commit}${r.dirty ? ", with uncommitted changes" : ""}). Commit bench/baselines.json to share it.`);
}

/** Baselines are committed: one line per board keeps the file small and its diffs readable. */
function writeBaselines(all: Record<string, RunFile>) {
  const sets = Object.entries(all).map(([name, { boards, ...info }]) => {
    const head = JSON.stringify(info, null, 2).slice(0, -2).replace(/\n/g, "\n  ");
    return `  ${JSON.stringify(name)}: ${head},\n    "boards": [\n${boards.map((b) => `      ${JSON.stringify(b)}`).join(",\n")}\n    ]\n  }`;
  });
  writeFileSync(BASELINES_FILE, `{\n${sets.join(",\n")}\n}\n`);
}

function compare(ref: string, other: string | undefined, args: Args) {
  const a = resolveRun(ref, args.str("set"));
  const b = resolveRun(other ?? "baseline", a.set);
  if (a.set !== b.set) throw new Error(`Runs ${a.id} and ${b.id} are on different sets.`);
  const deals = readSets()[a.set]?.deals ?? a.boards.length;
  console.log(summary(a, b, options(args, deals)));
}

function show(ref: string, args: Args) {
  const r = resolveRun(ref, args.str("set"));
  const n = args.num("board", 0);
  const cache = loadCache(r.set);
  const i = cache.deals.findIndex((d) => d.id === n);
  const board = r.boards.find((b) => b.id === n);
  if (i < 0 || !board) throw new Error(`Give a board from 1 to ${cache.deals.length} with --board.`);
  console.log(boardText(cache.deals[i]!, cache.layouts[i]!, board, r));
}

function list() {
  const sets = readSets();
  const baselines = readBaselines();
  const avg = (r: RunFile) => (r.boards.reduce((s, b) => s + b.loss, 0) / r.boards.length).toFixed(2);
  if (Object.keys(sets).length === 0) console.log('No sets yet. Make one with: npm run bench -- build quick');
  for (const [name, def] of Object.entries(sets)) {
    const built = existsSync(cachePath(name)) ? "built" : "not built on this computer";
    console.log(`Set ${name}: ${def.deals} deals, seed ${def.seed}, ${def.layouts} layouts, filter v${def.filter} (${built})`);
    const b = baselines[name];
    console.log(b ? `  Baseline  ${b.id}  ${b.commit}  loss ${avg(b)}${b.label ? `  "${b.label}"` : ""}` : "  No baseline");
    for (const id of runIds(name).slice(-10)) {
      const r = readJson<RunFile>(runPath(id), null as never);
      console.log(`  Run       ${id}  ${r.commit}${r.dirty ? "+" : " "} loss ${avg(r)}${r.label ? `  "${r.label}"` : ""}`);
    }
  }
}

// ---- The weak-opening experiment ----------------------------------------------------------------

const weakCachePath = (set: string) => resolve(CACHE, `weak-${set}.json`);

async function weakBuild(set: string, args: Args): Promise<WeakCache> {
  const sets = readWeakSets();
  const asked: WeakSetDefinition = {
    ...DEFAULT_WEAK_SET,
    deals: args.num("deals", sets[set]?.deals ?? DEFAULT_WEAK_SET.deals),
    seed: args.num("seed", sets[set]?.seed ?? DEFAULT_WEAK_SET.seed),
  };
  const def = sets[set];
  if (def && JSON.stringify(def) !== JSON.stringify(asked)) {
    throw new Error(`Weak set "${set}" already exists as ${JSON.stringify(def)}. Use a new name for a different set.`);
  }
  if (!def) {
    writeJson(WEAK_SETS_FILE, { ...sets, [set]: asked });
    console.log(`New weak set "${set}": ${JSON.stringify(asked)}`);
  }
  const cached = readJson<WeakCache | null>(weakCachePath(set), null);
  if (cached && JSON.stringify(cached.definition) === JSON.stringify(asked)) return cached;

  const deals = weakDealSet(asked);
  const threads = Math.max(1, Math.min(args.num("threads", availableParallelism() - 2), deals.length));
  console.log(`Building weak set "${set}": ${deals.length} deals, on ${threads} threads…`);
  const started = Date.now();
  const tables = new Map<number, string>();
  await new Promise<void>((done, fail) => {
    let next = 0;
    const workers = Array.from({ length: threads }, () => new Worker(new URL(import.meta.url)));
    const send = (w: Worker) => {
      if (next < deals.length) w.postMessage({ table: deals[next++]! } satisfies TableJob);
    };
    for (const w of workers) {
      w.on("error", fail);
      w.on("message", (m: { id: number; table: string }) => {
        tables.set(m.id, m.table);
        if (tables.size % 50 === 0 || tables.size === deals.length) process.stdout.write(`\r  ${tables.size} of ${deals.length} deals   `);
        if (tables.size === deals.length) {
          process.stdout.write("\n");
          void Promise.all(workers.map((x) => x.terminate())).then(() => done());
        } else send(w);
      });
      send(w);
    }
  });
  const cache: WeakCache = { definition: asked, deals, tables: deals.map((d) => tables.get(d.id)!) };
  writeJson(weakCachePath(set), cache, true);
  console.log(`Built in ${Math.round((Date.now() - started) / 1000)} s.`);
  return cache;
}

async function weakRun(set: string, args: Args) {
  const cache = await weakBuild(set, args);
  const started = Date.now();
  const baseCard = parseCard(args.str("base"));
  const variantCard = parseCard(args.str("card"));
  if (Object.keys(variantCard).length === 0) throw new Error("Give the variant with --card (for example --card weakTwoSuit=decent).");
  const base = { ...SAYC_DEFAULTS, ...baseCard } as SystemSettings;
  const variant = { ...base, ...variantCard } as SystemSettings;
  const boards = cache.deals.map((d, i) => runWeakBoard(d, cache.tables[i]!, base, variant));
  const now = new Date();
  const result: WeakRunFile = {
    id: `weak-${set}-${stamp(now)}`,
    set,
    label: args.str("label") ?? "",
    commit: git("rev-parse", "--short", "HEAD") || "unknown",
    dirty: git("status", "--porcelain", "--", ":/", ":(exclude,top)frontend/bench").length > 0,
    createdAt: now.toISOString(),
    ms: Date.now() - started,
    base: baseCard,
    variant: variantCard,
    boards,
  };
  writeJson(runPath(result.id), result, true);
  console.log(weakSummary(result, args.num("top", 10)));
}

function weakShow(ref: string, args: Args) {
  const id = ref === "latest" ? runIds("weak").at(-1) : ref;
  if (!id || !existsSync(runPath(id))) throw new Error(`No weak run called "${ref}".`);
  const r = readJson<WeakRunFile>(runPath(id), null as never);
  const cache = readJson<WeakCache | null>(weakCachePath(r.set), null);
  const n = args.num("board", 0);
  const deal = cache?.deals.find((d) => d.id === n);
  const board = r.boards.find((b) => b.id === n);
  if (!deal || !board) throw new Error(`Give a board of set "${r.set}" with --board.`);
  console.log(weakBoardText(deal, board));
}

/** The preempting side's card for the defence runs: weak twos and preempts with 3+ HCP in the suit. */
const DEFENCE_PREEMPTORS = { weakTwoSuit: "hcp3", preemptSuit: "hcp3" } as const;
const WEAK_BASELINES_FILE = resolve(BENCH, "weak-baselines.json");
const readWeakBaselines = () => readJson<Record<string, DefenceRunFile>>(WEAK_BASELINES_FILE, {});

async function weakDefence(set: string, args: Args) {
  const cache = await weakBuild(set, args);
  const started = Date.now();
  const preemptorCard = { ...DEFENCE_PREEMPTORS, ...parseCard(args.str("base")) };
  const defenderCard = parseCard(args.str("card"));
  const preemptors = { ...SAYC_DEFAULTS, ...preemptorCard } as SystemSettings;
  const defenders = { ...SAYC_DEFAULTS, ...defenderCard } as SystemSettings;
  const boards = cache.deals.map((d, i) => runDefenceBoard(d, cache.tables[i]!, preemptors, defenders));
  const now = new Date();
  const result: DefenceRunFile = {
    id: `defence-${set}-${stamp(now)}`,
    set,
    label: args.str("label") ?? "",
    commit: git("rev-parse", "--short", "HEAD") || "unknown",
    dirty: git("status", "--porcelain", "--", ":/", ":(exclude,top)frontend/bench").length > 0,
    createdAt: now.toISOString(),
    ms: Date.now() - started,
    preemptors: preemptorCard,
    defenders: defenderCard,
    boards,
  };
  writeJson(runPath(result.id), result, true);
  console.log(defenceSummary(result, readWeakBaselines()[set] ?? null, args.num("top", 10)));
}

function weakDefenceBaseline(set: string, ref?: string) {
  const id = ref ?? runIds(`defence-${set}`).at(-1);
  if (!id || !existsSync(runPath(id))) throw new Error(`No defence run for "${set}" yet.`);
  const r = readJson<DefenceRunFile>(runPath(id), null as never);
  const boards = r.boards.map(({ reasons: _, ...b }) => ({ ...b, reasons: [] }));
  const all = { ...readWeakBaselines(), [set]: { ...r, boards } };
  const sets = Object.entries(all).map(([name, { boards: bs, ...info }]) => {
    const head = JSON.stringify(info, null, 2).slice(0, -2).replace(/\n/g, "\n  ");
    return `  ${JSON.stringify(name)}: ${head},\n    "boards": [\n${bs.map((b) => `      ${JSON.stringify(b)}`).join(",\n")}\n    ]\n  }`;
  });
  writeFileSync(WEAK_BASELINES_FILE, `{\n${sets.join(",\n")}\n}\n`);
  console.log(`Defence baseline for "${set}" is now ${r.id} (${r.commit}${r.dirty ? ", with uncommitted changes" : ""}). Commit bench/weak-baselines.json to share it.`);
}

// ---- Entry point (last, so everything above is defined) ----------------------------------------

if (!isMainThread) {
  // A worker: solve every layout of each deal it's sent.
  const solver = new SyncSolver();
  parentPort!.on("message", async (job: LayoutJob | TableJob) => {
    if ("table" in job) {
      parentPort!.postMessage({ id: job.table.id, table: encodeTable(await solver.table(handsOf(job.table))) });
      return;
    }
    const { deal, def } = job;
    const layouts: string[] = [];
    for (const hands of ewLayouts(deal, def)) layouts.push(encodeTricks(await solver.table(hands)));
    parentPort!.postMessage({ id: deal.id, layouts } satisfies LayoutDone);
  });
} else {
  await main().catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  });
}

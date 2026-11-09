// The timing page: runs the two worst cases a bot faces, on this device, with 1 and several
// copies of DDS. See ../README.md.

import { sampleDeals, seeded } from "./deals.js";

// South's hand from demo board 1. The card decision: South leads against East's 4♥.
const SEAT = "S";
const HAND = "QJT98.62.AK94.85";
const CARD_DEALS = 100;
const BID_DEALS = 200;
const CHUNK = 4; // deals handed to a worker at a time, so fast workers take more

const $ = (id) => document.getElementById(id);
const log = (html) => ($("log").insertAdjacentHTML("beforeend", html), $("log").lastElementChild?.scrollIntoView());
const fmt = (ms) => (ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${Math.round(ms)} ms`);

const cores = navigator.hardwareConcurrency || 1;
$("device").textContent = `${cores} logical cores reported · ${navigator.userAgent}`;
const workerSelect = $("workers");
for (const n of [1, 2, 3, 4, 6, 8, 12, 16].filter((n) => n <= Math.max(cores, 4))) {
  workerSelect.add(new Option(String(n), String(n), false, n === Math.min(4, cores)));
}

/** Starts `n` workers and waits until each has loaded DDS. */
async function startPool(n) {
  const t0 = performance.now();
  const workers = Array.from({ length: n }, () => new Worker(new URL("./worker.js", import.meta.url), { type: "module" }));
  const loads = await Promise.all(
    workers.map((w) => new Promise((ok) => w.addEventListener("message", (e) => e.data.type === "ready" && ok(e.data.loadMs), { once: true }))),
  );
  return { workers, startMs: performance.now() - t0, loadMs: Math.max(...loads) };
}

/** Runs every deal through the pool; resolves with the wall time and the solver time per deal. */
function runJob(pool, kind, deals, extra = {}) {
  return new Promise((resolve) => {
    const t0 = performance.now();
    let next = 0;
    let done = 0;
    let solverMs = 0;
    const results = new Array(deals.length);
    const feed = (w) => {
      if (next >= deals.length) return;
      const id = next;
      const batch = deals.slice(next, next + CHUNK);
      next += batch.length;
      w.postMessage({ id, kind, deals: batch, ...extra });
    };
    for (const w of pool.workers) {
      w.onmessage = (e) => {
        if (e.data.type !== "done") return;
        e.data.results.forEach((r, i) => (results[e.data.id + i] = r));
        solverMs += e.data.ms;
        done += e.data.results.length;
        if (done === deals.length) resolve({ wallMs: performance.now() - t0, perDealMs: solverMs / deals.length, results });
        else feed(w);
      };
      feed(w);
    }
  });
}

/** Which lead does best across the samples, as a bot would choose it. */
function bestLead(results) {
  const totals = new Map();
  for (const leads of results) for (const { card, tricks } of leads) totals.set(card, (totals.get(card) ?? 0) + tricks);
  const [card, sum] = [...totals].sort((a, b) => b[1] - a[1])[0];
  return `${card[1]}${{ S: "♠", H: "♥", D: "♦", C: "♣" }[card[0]]} (${(sum / results.length).toFixed(2)} defensive tricks on average)`;
}

async function run(n) {
  log(`<h3>${n} ${n === 1 ? "copy" : "copies"} of DDS</h3>`);
  const pool = await startPool(n);
  log(`<p>Started in ${fmt(pool.startMs)} (loading DDS: ${fmt(pool.loadMs)})</p>`);

  const cardDeals = sampleDeals(SEAT, HAND, CARD_DEALS, seeded(1));
  const card = await runJob(pool, "leads", cardDeals, { trump: "H", leader: "S" });
  log(
    `<p><b>Card decision</b> (opening lead, ${CARD_DEALS} deals): <b>${fmt(card.wallMs)}</b>` +
      ` · ${fmt(card.perDealMs)} per deal on one copy · best lead ${bestLead(card.results)}</p>`,
  );

  const bidDeals = sampleDeals(SEAT, HAND, BID_DEALS, seeded(2));
  const bid = await runJob(pool, "table", bidDeals);
  log(
    `<p><b>Bidding decision</b> (${BID_DEALS} full tables): <b>${fmt(bid.wallMs)}</b>` +
      ` · ${fmt(bid.perDealMs)} per table on one copy</p>`,
  );

  pool.workers.forEach((w) => w.terminate());
}

async function guarded(fn) {
  document.querySelectorAll("button").forEach((b) => (b.disabled = true));
  try {
    await fn();
  } catch (err) {
    log(`<p class="error">${err}</p>`);
  } finally {
    document.querySelectorAll("button").forEach((b) => (b.disabled = false));
  }
}

$("run").onclick = () => guarded(() => run(Number(workerSelect.value)));
$("runBoth").onclick = () => guarded(async () => {
  await run(1);
  await run(Number(workerSelect.value));
});
$("clear").onclick = () => ($("log").innerHTML = "");

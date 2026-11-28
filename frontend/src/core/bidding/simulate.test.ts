import { describe, expect, it } from "vitest";
import { type Call, auctionResult, parseCall } from "../auction";
import { hcp, parseHand, parsePbnDeal } from "../deal";
import { SyncSolver } from "../../dds/syncSolver";
import { BOT_SIMULATION, continueWithRules, decide, decideWithSimulation, judgmentCandidates, positionAt, simulatesCall } from "./bidder";
import { seeded } from "../random";
import { dealsFittingAuction, simulateHardCall } from "./simulate";

const calls = (text: string): Call[] => text.split(" ").filter(Boolean).map((t) => parseCall(t)!);
const solver = new SyncSolver();

// North opens 1♠, South raises, East–West bid to 5♥ over our 4♠: bid on, double or pass?
const deal = { dealer: "N", vul: "None" } as const;
const auction = calls("1S 2H 2S 4H 4S 5H PASS PASS");
const north = parseHand("AKJ84.32.KQ4.Q32");

describe("simulating hard calls", () => {
  it("deals hands that fit what each seat has shown", () => {
    const p = positionAt(deal, auction);
    let seed = 1;
    const deals = dealsFittingAuction(p, north, 20, 40_000, () => ((seed = (seed * 16807) % 2147483647) / 2147483647));
    expect(deals.length).toBeGreaterThan(0);
    for (const d of deals) {
      expect(d.N).toEqual(north);
      expect(d.S.S.length).toBeGreaterThanOrEqual(p.shown.S.len.S[0]); // South's raise showed spades
      expect(d.E.H.length).toBeGreaterThanOrEqual(p.shown.E.len.H[0]); // East's overcall showed hearts
    }
  });

  it("scores each candidate over the deals and picks the best, the same way every time", async () => {
    const p = positionAt(deal, auction);
    const start = performance.now();
    const sim = await simulateHardCall(p, north, [calls("PASS")[0]!, calls("X")[0]!, calls("5S")[0]!], solver);
    const ms = performance.now() - start;
    expect(sim).not.toBeNull();
    expect(sim!.deals).toBeGreaterThanOrEqual(16);
    expect(sim!.results.map((r) => r.share).reduce((a, b) => a + b, 0)).toBeCloseTo(1.5, 5); // 3 candidates share 3 × ½
    const again = await simulateHardCall(p, north, [calls("PASS")[0]!, calls("X")[0]!, calls("5S")[0]!], solver);
    expect(again).toEqual(sim);
    console.log(`simulation: ${sim!.deals} deals in ${Math.round(ms)} ms`, sim!.results.map((r) => `${r.call.kind === "bid" ? `${r.call.level}${r.call.strain}` : r.call.kind} ${Math.round(r.share * 100)}%`).join(", "));
  });

  it("decides the bot's hard call by simulation, with the figures in its reason", async () => {
    const d = await decideWithSimulation(positionAt(deal, auction), north, solver);
    expect(d.hard).not.toBeNull();
    expect(d.simulation).toBeDefined();
    expect(d.reason).toMatch(/deals that fit the bidding/);
  });

  it("keeps the rule of thumb without a solver", async () => {
    const d = await decideWithSimulation(positionAt(deal, auction), north, null);
    expect(d.simulation).toBeUndefined();
  });

  it("samples a cuebid raise as support points with the fit in hearts", () => {
    const p = positionAt(deal, calls("1H 1S 2S 3H"));
    const hand = parseHand("87.AKT84.Q87.A76");
    const layouts = dealsFittingAuction(p, hand, 60, 40_000, seeded(1382));
    expect(p.shown.S.hcp[0]).toBe(0);
    expect(p.shown.S.strength).toContainEqual({ kind: "support", suit: "H", range: [10, 50] });
    expect(layouts.some((layout) => hcp(layout.S) < 10)).toBe(true);
  });

  it("relaxes inconsistent HCP evidence without changing the bidder's real hand", async () => {
    const p = positionAt(deal, calls("1H 1S 2S 3H"));
    p.shown.S.hcp = [17, 37];
    p.shown.W.hcp = [10, 37];
    const hand = parseHand("87.AKT84.Q87.A76");
    const zeroTricks = { ...solver, tricks: async (jobs: Parameters<typeof solver.tricks>[0]) => {
      expect(jobs.length).toBeGreaterThan(0);
      expect(jobs.every((job) => job.hands.N === hand)).toBe(true);
      return jobs.map(() => 7);
    }, cards: solver.cards.bind(solver), table: solver.table.bind(solver) };
    const result = await simulateHardCall(p, hand, calls("PASS X"), zeroTricks);
    expect(result?.relaxed).toBe(true);
  });

  it("continues an open pass and respects a closing pass", () => {
    const hands = parsePbnDeal("N:87.AKT84.Q87.A76 QJ9632.J9.A654.8 5.7632.3.KQJ9543 AKT4.Q5.KJT92.T2");
    const prefix = calls("1H 1S 2S 3H");
    const pass: Call = { kind: "pass" };
    const played = continueWithRules(positionAt(deal, prefix), pass, hands);
    expect(auctionResult(deal.dealer, played)?.contract).toMatchObject({ level: 4, strain: "S" });
    const closing = [...prefix, pass, pass];
    expect(continueWithRules(positionAt(deal, closing), pass, hands)).toEqual([...closing, pass]);
  });
});

describe("simulation scored in IMPs, and competitive judgment", () => {
  const p = positionAt(deal, auction);
  const three = () => [calls("PASS")[0]!, calls("X")[0]!, calls("5S")[0]!];

  it("scores IMPs against the other candidates, and picks by them when asked", async () => {
    const sim = await simulateHardCall(p, north, three(), solver, { scoring: "imps" });
    expect(sim).not.toBeNull();
    // Each pair of candidates is IMPed both ways, so the IMPs sum to zero.
    expect(sim!.results.reduce((a, r) => a + r.imps, 0)).toBeCloseTo(0, 5);
    expect(sim!.results[0]!.imps).toBe(Math.max(...sim!.results.map((r) => r.imps)));
  });

  it("the bots simulate in IMPs, with judgment and the auction continued, by default", async () => {
    expect(BOT_SIMULATION).toEqual({ scoring: "imps", judgment: true, continueAuction: true });
    // A judgment position (over their 5♥) is simulated even though no rule flags it.
    const d = decide(p, north);
    expect(simulatesCall(p, north, d)).toBe(true);
    const sim = await decideWithSimulation(p, north, solver);
    expect(sim.simulation?.scoring).toBe("imps");
  });

  it("offers judgment candidates only near the end of a competitive auction", () => {
    // Over their 5♥, with both sides having bid: pass, double, or our spades.
    const c = judgmentCandidates(p, north, calls("PASS")[0]!)!.map((x) => (x.kind === "bid" ? `${x.level}${x.strain}` : x.kind));
    expect(c).toEqual(expect.arrayContaining(["pass", "double", "5S"]));
    // Partner's opening, nothing from them: no judgment.
    expect(judgmentCandidates(positionAt(deal, calls("1S PASS")), parseHand("Q96.K32.A954.Q32"), calls("2S")[0]!)).toBeNull();
  });

  // Marc's board 2 (November 2026 feedback): 1♥ Pass 4♥ to North, who passed with 6–5 in
  // diamonds and spades but bid 5♠ over 5♥ later (in the balancing seat, where judgment applied).
  // Marc's board 4 (November 2026 feedback): West opened 2♠, partner passed, and simulation had
  // West sacrifice in 4♠ over 4♥ (doubled, five down).
  // Marc's board 6: East's rules flagged pass-or-double over 4♦; bidding 4♥ in the fit was never weighed.
  it("adds judgment's choices to a hard call the rules flag", async () => {
    const d = { dealer: "E", vul: "EW" } as const;
    const pos = positionAt(d, calls("1C 1D 3C X PASS 3D 3H PASS PASS 4D PASS PASS"));
    const hand = parseHand("AK85.AQ43.5.KT97");
    const rules = decide(pos, hand);
    expect(rules.hard?.candidates.map((x) => (x.kind === "bid" ? `${x.level}${x.strain}` : x.kind))).toEqual(["pass", "double"]);
    const sim = await decideWithSimulation(pos, hand, solver);
    expect(sim.simulation?.results.map((r) => (r.call.kind === "bid" ? `${r.call.level}${r.call.strain}` : r.call.kind))).toEqual(expect.arrayContaining(["4H", "5C"]));
  });

  it("offers no judgment to a preempter whose partner has only passed", () => {
    const d = { dealer: "W", vul: "Both" } as const;
    expect(judgmentCandidates(positionAt(d, calls("2S PASS PASS 4H")), parseHand("KT9652.2.63.KT85"), calls("PASS")[0]!)).toBeNull();
    // Once partner has raised, the decision is back on the table.
    expect(judgmentCandidates(positionAt(d, calls("2S PASS 3S 4H")), parseHand("KT9652.2.63.KT85"), calls("PASS")[0]!)).not.toBeNull();
  });

  it("offers judgment over their four-level bid while our side has said nothing", () => {
    const over4 = positionAt({ dealer: "E", vul: "NS" }, calls("1H PASS 4H"));
    const c = judgmentCandidates(over4, parseHand("KQ865.4.AKT953.Q"), calls("PASS")[0]!)!.map((x) => (x.kind === "bid" ? `${x.level}${x.strain}` : x.kind));
    expect(c).toEqual(["pass", "double", "4S", "5D"]);
    // Over their three-level bid the overcall rules still decide.
    expect(judgmentCandidates(positionAt({ dealer: "E", vul: "NS" }, calls("1H PASS 3H")), parseHand("KQ865.4.AKT953.Q"), calls("PASS")[0]!)).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { type Call, parseCall } from "../auction";
import { parseHand } from "../deal";
import { SyncSolver } from "../../dds/syncSolver";
import { decideWithSimulation, positionAt } from "./bidder";
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
});

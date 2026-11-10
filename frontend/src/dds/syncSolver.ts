// Double dummy without workers: one copy of DDS on the current thread. For Node (tests and the
// bidding report); the browser uses the worker pool (workerSolver.ts) so the page stays responsive.

import type { DoubleDummyJob, DoubleDummySolver, DoubleDummyTable } from "../core/doubleDummy";
import type { Hand, Seat } from "../core/types";
import createDdsModule from "./dds.js";
import { type Engine, makeEngine } from "./engine";

export class SyncSolver implements DoubleDummySolver {
  private engine: Promise<Engine> = createDdsModule().then(makeEngine);

  async tricks(jobs: DoubleDummyJob[]): Promise<number[]> {
    const e = await this.engine;
    return jobs.map((j) => e.tricks(j));
  }

  async table(hands: Record<Seat, Hand>): Promise<DoubleDummyTable> {
    return (await this.engine).table(hands);
  }
}

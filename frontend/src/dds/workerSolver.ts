// Double dummy in the browser: a few Web Workers, each with its own copy of DDS, started when first
// needed. A batch of contracts is split between them, so a simulation of many deals runs on several
// processor cores at once while the page stays responsive.

import type { DoubleDummyJob, DoubleDummySolver, DoubleDummyTable } from "../core/doubleDummy";
import type { Hand, Seat } from "../core/types";
import type { WorkerRequest, WorkerResponse, WorkerTask } from "./worker";

/** Contracts handed to a worker at a time: small enough that the fast workers take more. */
const CHUNK = 8;

export class WorkerPoolSolver implements DoubleDummySolver {
  private workers: Worker[] = [];
  private nextId = 1;
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

  /** How many copies: leave a core for the page, at most 4 (more barely helps and costs memory). */
  private readonly size = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1));

  private pool(): Worker[] {
    if (this.workers.length === 0) {
      for (let i = 0; i < this.size; i++) {
        const w = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
        w.onmessage = (e: MessageEvent<WorkerResponse>) => {
          const p = this.pending.get(e.data.id);
          if (!p) return;
          this.pending.delete(e.data.id);
          if (e.data.ok) p.resolve(e.data.result);
          else p.reject(new Error(e.data.error));
        };
        this.workers.push(w);
      }
    }
    return this.workers;
  }

  private send(worker: Worker, req: WorkerTask): Promise<unknown> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      worker.postMessage({ ...req, id } as WorkerRequest);
    });
  }

  async tricks(jobs: DoubleDummyJob[]): Promise<number[]> {
    const workers = this.pool();
    const results = new Array<number>(jobs.length);
    let next = 0;
    // Each worker takes the next chunk as soon as it's free.
    await Promise.all(
      workers.map(async (w) => {
        while (next < jobs.length) {
          const start = next;
          next += CHUNK;
          const out = (await this.send(w, { kind: "tricks", jobs: jobs.slice(start, start + CHUNK) })) as number[];
          out.forEach((t, i) => (results[start + i] = t));
        }
      }),
    );
    return results;
  }

  async table(hands: Record<Seat, Hand>): Promise<DoubleDummyTable> {
    return (await this.send(this.pool()[0]!, { kind: "table", hands })) as DoubleDummyTable;
  }
}

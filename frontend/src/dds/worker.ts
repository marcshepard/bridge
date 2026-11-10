// A Web Worker with its own copy of DDS. The pool (workerSolver.ts) sends it contracts to solve or
// deals to tabulate; it answers each message with the same id.

import type { CardPlayJob, DoubleDummyJob } from "../core/doubleDummy";
import type { Hand, Seat } from "../core/types";
import createDdsModule from "./dds.js";
import { makeEngine } from "./engine";

/** What the pool asks for, before it's given an id. */
export type WorkerTask =
  | { kind: "tricks"; jobs: DoubleDummyJob[] }
  | { kind: "table"; hands: Record<Seat, Hand> }
  | { kind: "cards"; jobs: CardPlayJob[] };
export type WorkerRequest = WorkerTask & { id: number };
export type WorkerResponse = { id: number; ok: true; result: unknown } | { id: number; ok: false; error: string };

const engine = createDdsModule().then(makeEngine);

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const req = e.data;
  try {
    const dds = await engine;
    const result =
      req.kind === "tricks" ? req.jobs.map((j) => dds.tricks(j)) : req.kind === "cards" ? req.jobs.map((j) => dds.cards(j)) : dds.table(req.hands);
    (self as unknown as Worker).postMessage({ id: req.id, ok: true, result } satisfies WorkerResponse);
  } catch (err) {
    (self as unknown as Worker).postMessage({ id: req.id, ok: false, error: String(err) } satisfies WorkerResponse);
  }
};

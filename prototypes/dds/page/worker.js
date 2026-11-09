// One copy of DDS in a Web Worker. The page starts several and splits the deals between them.

import { loadDds } from "./ddsApi.js";

const t0 = performance.now();
const ddsReady = loadDds().then((dds) => {
  postMessage({ type: "ready", loadMs: performance.now() - t0 });
  return dds;
});

onmessage = async (e) => {
  const dds = await ddsReady;
  const { id, kind, deals, trump, leader } = e.data;
  const start = performance.now();
  const results = deals.map((hands) =>
    kind === "table" ? dds.calcTable(hands) : dds.solveLeads(hands, trump, leader),
  );
  postMessage({ type: "done", id, results, ms: performance.now() - start });
};

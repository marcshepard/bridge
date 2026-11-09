// Checks the WebAssembly DDS against the double dummy stored in the demo game (computed earlier
// with endplay, which wraps the long-established DDS 2.x), then times it in Node for a baseline.
//   node prototypes/dds/check.mjs

import { readFileSync } from "node:fs";
import { loadDds } from "./page/ddsApi.js";

const game = JSON.parse(readFileSync(new URL("../../backend/src/demo/demo-game.json", import.meta.url), "utf8"));
const dds = await loadDds();

let mismatches = 0;
let checked = 0;
const t0 = performance.now();
for (const board of game.boards) {
  const expected = board.doubleDummy?.tricks;
  if (!expected) continue;
  const got = dds.calcTable(board.hands);
  checked++;
  for (const seat of ["N", "E", "S", "W"]) {
    for (const strain of ["S", "H", "D", "C", "NT"]) {
      if (got[seat][strain] !== expected[seat][strain]) {
        mismatches++;
        console.log(`Board ${board.number} ${seat} ${strain}: got ${got[seat][strain]}, expected ${expected[seat][strain]}`);
      }
    }
  }
}
const ms = performance.now() - t0;
console.log(`${checked} boards checked, ${mismatches} mismatches, ${(ms / checked).toFixed(1)} ms per full table (Node)`);

const b1 = game.boards[0];
console.log(`Board ${b1.number}, leads against 4H by E (South on lead):`, dds.solveLeads(b1.hands, "H", "S"));

// One copy of DDS (the WebAssembly in dds.wasm), with plain calls: a full table, or one contract's
// tricks. Synchronous: it runs inside a Web Worker in the browser (worker.ts), or directly in Node
// for tests and the bidding report (syncSolver.ts).

import { handToString } from "../core/deal";
import type { DoubleDummyJob, DoubleDummyTable } from "../core/doubleDummy";
import { nextSeat } from "../core/play";
import type { Hand, Seat, Strain } from "../core/types";
import type { DdsModule } from "./dds.js";

const SEATS: Seat[] = ["N", "E", "S", "W"];
/** DDS's order of strains. */
const DDS_STRAINS: Strain[] = ["S", "H", "D", "C", "NT"];

/** The deal as DDS reads it: "N:<north> <east> <south> <west>". */
export const toPbn = (hands: Record<Seat, Hand>) => "N:" + SEATS.map((s) => handToString(hands[s])).join(" ");

export interface Engine {
  table(hands: Record<Seat, Hand>): DoubleDummyTable;
  /** Declarer's tricks in one contract. */
  tricks(job: DoubleDummyJob): number;
}

export function makeEngine(m: DdsModule): Engine {
  const tableBuf = m._malloc(20 * 4);
  const strBuf = m._malloc(128);
  const put = (hands: Record<Seat, Hand>) => m.stringToUTF8(toPbn(hands), strBuf, 128);
  return {
    table(hands) {
      put(hands);
      const rc = m._bd_table(strBuf, tableBuf);
      if (rc !== 1) throw new Error(`Double dummy failed (${rc})`);
      const out = {} as DoubleDummyTable;
      SEATS.forEach((seat, h) => {
        out[seat] = {} as Record<Strain, number>;
        DDS_STRAINS.forEach((strain, s) => (out[seat][strain] = m.getValue(tableBuf + (s * 4 + h) * 4, "i32")));
      });
      return out;
    },
    tricks({ hands, strain, declarer }) {
      put(hands);
      // The opening leader is declarer's left-hand opponent; DDS gives the defenders' tricks.
      const defence = m._bd_tricks(strBuf, DDS_STRAINS.indexOf(strain), SEATS.indexOf(nextSeat(declarer)));
      if (defence < 0) throw new Error("Double dummy failed");
      return 13 - defence;
    },
  };
}

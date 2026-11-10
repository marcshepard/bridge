// One copy of DDS (the WebAssembly in dds.wasm), with plain calls: a full table, or one contract's
// tricks. Synchronous: it runs inside a Web Worker in the browser (worker.ts), or directly in Node
// for tests and the bidding report (syncSolver.ts).

import { handToString } from "../core/deal";
import type { CardPlayJob, CardScore, DoubleDummyJob, DoubleDummyTable } from "../core/doubleDummy";
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
  /** Every legal card for the player to move, with the tricks their side then takes. */
  cards(job: CardPlayJob): CardScore[];
}

const DDS_SUITS = ["S", "H", "D", "C"] as const;
const RANKS_LOW_TO_HIGH = "23456789TJQKA";
/** DDS ranks: 2..14 (ace 14). */
const ddsRank = (rank: string) => RANKS_LOW_TO_HIGH.indexOf(rank) + 2;

export function makeEngine(m: DdsModule): Engine {
  const tableBuf = m._malloc(20 * 4);
  const strBuf = m._malloc(128);
  const suitsBuf = m._malloc(3 * 4);
  const ranksBuf = m._malloc(3 * 4);
  const cardsBuf = m._malloc((1 + 13 * 3) * 4);
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
    cards({ hands, trump, leader, trick }) {
      put(hands);
      trick.forEach((c, i) => {
        m.setValue(suitsBuf + i * 4, DDS_SUITS.indexOf(c.suit), "i32");
        m.setValue(ranksBuf + i * 4, ddsRank(c.rank), "i32");
      });
      const rc = m._bd_cards(strBuf, DDS_STRAINS.indexOf(trump), SEATS.indexOf(leader), trick.length, suitsBuf, ranksBuf, cardsBuf);
      if (rc !== 1) throw new Error(`Double dummy failed (${rc})`);
      const n = m.getValue(cardsBuf, "i32");
      return Array.from({ length: n }, (_, i) => {
        const at = cardsBuf + (1 + 3 * i) * 4;
        return {
          card: { suit: DDS_SUITS[m.getValue(at, "i32")]!, rank: RANKS_LOW_TO_HIGH[m.getValue(at + 4, "i32") - 2]! },
          tricks: m.getValue(at + 8, "i32"),
        };
      });
    },
  };
}

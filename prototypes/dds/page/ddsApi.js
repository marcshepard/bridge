// A thin JavaScript wrapper round the DDS WebAssembly build (page/dds/dds.js), shared by the
// Web Worker and the Node check. Seats are N E S W; hands are "spades.hearts.diamonds.clubs".

import createDdsModule from "./dds/dds.js";

const SEATS = ["N", "E", "S", "W"];
const STRAINS = ["S", "H", "D", "C", "NT"]; // DDS's order
const TRUMP_INDEX = { S: 0, H: 1, D: 2, C: 3, NT: 4 };
const SUIT_LETTERS = ["S", "H", "D", "C"];
const RANKS = "  23456789TJQKA";

/** PBN deal string DDS expects: "N:<north> <east> <south> <west>". */
export function toPbn(hands) {
  return "N:" + SEATS.map((s) => hands[s]).join(" ");
}

export async function loadDds() {
  const m = await createDdsModule();
  const tableBuf = m._malloc(20 * 4);
  const leadsBuf = m._malloc((1 + 13 * 3) * 4);
  const strBuf = m._malloc(128);

  const putString = (s) => m.stringToUTF8(s, strBuf, 128);
  const ints = (ptr, n) => Array.from({ length: n }, (_, i) => m.getValue(ptr + i * 4, "i32"));

  return {
    /** Tricks for each seat as declarer in each strain: { N: { S, H, D, C, NT }, ... }. */
    calcTable(hands) {
      putString(toPbn(hands));
      const rc = m._dds_web_calc_table(strBuf, tableBuf);
      if (rc !== 1) throw new Error(`DDS calc table failed: ${rc}`);
      const flat = ints(tableBuf, 20);
      const out = {};
      SEATS.forEach((seat, h) => {
        out[seat] = {};
        STRAINS.forEach((strain, s) => (out[seat][strain] = flat[s * 4 + h]));
      });
      return out;
    },

    /**
     * Every card `leader` could lead in `trump`, with the tricks the leader's side then takes:
     * [{ card: "SA", tricks }]. The same work a bot does for one card decision on one deal.
     */
    solveLeads(hands, trump, leader) {
      putString(toPbn(hands));
      const rc = m._dds_web_solve_leads(strBuf, TRUMP_INDEX[trump], SEATS.indexOf(leader), leadsBuf);
      if (rc !== 1) throw new Error(`DDS solve leads failed: ${rc}`);
      const n = m.getValue(leadsBuf, "i32");
      const flat = ints(leadsBuf + 4, n * 3);
      return Array.from({ length: n }, (_, i) => ({
        card: SUIT_LETTERS[flat[i * 3]] + RANKS[flat[i * 3 + 1]],
        tricks: flat[i * 3 + 2],
      }));
    },
  };
}

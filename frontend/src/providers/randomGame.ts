// Random deals for practice with bots: a game file of freshly dealt boards, with dealer and
// vulnerability as on real duplicate boards. There's no field (nobody else played them), and no
// double dummy: the device works that out after each auction, as it does for Common Game pages.

import { boardDealer, boardVulnerability, handToString, randomDeal } from "../core/deal";
import { SEATS } from "../core/types";
import type { GameFileV1 } from "./gameFile";

/** As many boards as a full Common Game set, so a long session doesn't wrap round. */
export const RANDOM_BOARDS = 36;

export function randomGameFile(rand: () => number = Math.random, boards = RANDOM_BOARDS): GameFileV1 {
  return {
    schemaVersion: 1,
    id: `random-${Math.floor(rand() * 2 ** 32).toString(36)}`,
    title: "Random deals",
    source: { name: "Dealt by Bridge Replay" },
    boards: Array.from({ length: boards }, (_, i) => {
      const number = i + 1;
      const deal = randomDeal(rand);
      return {
        number,
        dealer: boardDealer(number),
        vul: boardVulnerability(number),
        hands: Object.fromEntries(SEATS.map((s) => [s, handToString(deal[s])])),
      };
    }),
  };
}

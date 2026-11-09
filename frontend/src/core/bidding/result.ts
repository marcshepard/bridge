// Scoring a board that was only bid: the contract makes the number of tricks double dummy says it
// does (perfect play by everyone). Used by bidding practice, the bidding review and the report.

import type { Contract, Seat, TableResult } from "../types";
import type { DoubleDummy } from "../../providers/types";

/**
 * The result of a contract played double dummy, or null when the source has no double-dummy trick
 * table (a Common Game page gives only the par score). Passed out is always a result.
 */
export function doubleDummyResult(dd: DoubleDummy | undefined, contract: Contract | null, declarer: Seat | null): TableResult | null {
  if (!contract || !declarer) return { contract: null, declarer: null, tricks: 0 };
  const tricks = dd?.tricks?.[declarer]?.[contract.strain];
  return tricks === undefined ? null : { contract, declarer, tricks };
}

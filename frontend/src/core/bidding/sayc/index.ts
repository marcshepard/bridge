// SAYC: every rule for a position, in priority order. The specific rules first (openings,
// structured auctions, responses and rebids, competition), then Blackwood, placing the contract,
// and the fallback. Only legal calls are kept; when partner is forcing me, Pass is dropped.

import type { CallRule } from "../model";
import { type Position, canMake, forced, opening } from "../position";
import { competitiveRules } from "./competition";
import { constructiveRules } from "./constructive";
import { fallbackRules, placementRules, slamRules } from "./general";
import { structuredRules } from "./notrump";
import { openingRules } from "./opening";

export function saycRules(p: Position): CallRule[] {
  const rules: CallRule[] = opening(p)
    ? [...slamRules(p), ...structuredRules(p), ...constructiveRules(p), ...competitiveRules(p), ...placementRules(p), ...fallbackRules(p)]
    : openingRules(p);
  const mustBid = forced(p);
  return rules.filter((r) => canMake(p, r.call) && !(mustBid && r.call.kind === "pass"));
}

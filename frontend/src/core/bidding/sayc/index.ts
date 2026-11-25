// SAYC: every rule for a position, in priority order. The specific rules first (openings,
// structured auctions, responses and rebids, competition), then Blackwood, placing the contract,
// and the fallback. Only legal calls are kept; when partner is forcing me, Pass is dropped.

import type { HandFacts } from "../evaluate";
import type { CallRule } from "../model";
import { type Position, canMake, forced, gameLevel, opening, partnerLast } from "../position";
import { competitiveRules } from "./competition";
import { constructiveRules } from "./constructive";
import { fallbackRules, placementRules, slamCards, slamRules } from "./general";
import { structuredRules } from "./notrump";
import { openingRules } from "./opening";

export function saycRules(p: Position): CallRule[] {
  if (!opening(p)) return legal(p, openingRules(p));
  const specific = legal(p, [...structuredRules(p), ...constructiveRules(p), ...competitiveRules(p)]);
  const placement = placementRules(p);
  return legal(p, [...slamRules(p), ...slamTakeover(p, specific, placement), ...specific, ...placement, ...fallbackRules(p)]);
}

function legal(p: Position, rules: CallRule[]): CallRule[] {
  const mustBid = forced(p);
  return rules.filter((r) => canMake(p, r.call) && !(mustBid && r.call.kind === "pass"));
}

/** The placement plan's moves towards slam: asking, inviting, control bids, or bidding it. */
const SLAM_MOVES = new Set(["Blackwood", "Slam invitation", "Control bid"]);
const isSlamMove = (r: CallRule) => SLAM_MOVES.has(r.name ?? "") || (r.call.kind === "bid" && r.call.level >= 6);

/**
 * The specific rules place most games directly ("4♠: game in the fit") from fixed ranges, and so
 * stop in game with slam values. When the specific rule's choice is a natural, non-forcing call no
 * higher than game, and the placement plan (which weighs partner's shown points against mine) sees
 * a slam, the plan's slam move comes first. Only for calls no specific rule gives another meaning,
 * so partner reads them the way the plan means them; and not when partner's last call was a
 * forcing convention, which needs its answer. The point count can mislead (shape counted in both
 * hands), so the cards must back it: about 31 HCP between us for notrump, or 30 HCP and 9 controls
 * (ace 2, king 1) for a suit. Blackwood from 28 HCP: with a fit, the aces are often what decides
 * it, and the answer still stops at the five level when two are missing.
 */
function slamTakeover(p: Position, specific: CallRule[], placement: CallRule[]): CallRule[] {
  const pl = partnerLast(p);
  if (pl?.rule?.name && pl.forcing && pl.forcing !== "no") return [];
  const settles = (h: HandFacts) => {
    const r = specific.find((x) => x.when(h));
    if (!r) return false;
    if (r.forcing && r.forcing !== "no") return false;
    if (r.call.kind === "pass") return true;
    return r.call.kind === "bid" && r.call.level <= gameLevel(r.call.strain) && (!r.name || r.name === "Game invitation");
  };
  return placement
    .filter((r) => isSlamMove(r) && !specific.some((s) => s.call.kind === r.call.kind && (r.call.kind !== "bid" || (s.call.kind === "bid" && s.call.level === r.call.level && s.call.strain === r.call.strain))))
    .map((r) => ({ ...r, when: (h: HandFacts) => settles(h) && backed(p, h, r) && r.when(h) }));
}

const TAKEOVER = { ntHcp: 31, suitHcp: 30, suitControls: 9 };

function backed(p: Position, h: HandFacts, r: CallRule): boolean {
  const c = slamCards(p, h);
  const nt = r.call.kind === "bid" && r.call.strain === "NT" && r.name !== "Blackwood";
  const hcp = r.name === "Blackwood" ? TAKEOVER.suitHcp - 2 : TAKEOVER.suitHcp;
  return nt ? c.hcp >= TAKEOVER.ntHcp : c.hcp >= hcp && c.controls >= TAKEOVER.suitControls;
}

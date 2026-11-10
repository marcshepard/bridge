// What the bidding tells the play: what each hand showed (for dealing the hidden hands), the suits
// each seat bid naturally (an opening lead prefers partner's), and each side's card (leads and
// signals). Read with the same rules as the bidding review, by each side's own card.

import type { Call } from "../auction";
import { type Deal, type Systems, readAuction, systemFor } from "../bidding/bidder";
import { unknownHand } from "../bidding/model";
import { isBid, isNatural } from "../bidding/position";
import { SAYC_DEFAULTS } from "../bidding/system";
import type { Seat, Suit } from "../types";
import type { PlayContext } from "./decide";

export function playContext(deal: Deal, calls: Call[], systems: Systems = SAYC_DEFAULTS): PlayContext {
  const steps = calls.length > 0 ? readAuction(deal, calls, systems) : null;
  const last = steps?.at(-1)!.position;
  const bidSuits = { N: [], E: [], S: [], W: [] } as Record<Seat, Suit[]>;
  for (const r of last?.read ?? []) {
    if (isNatural(r) && isBid(r.call) && r.call.strain !== "NT" && !bidSuits[r.seat].includes(r.call.strain)) bidSuits[r.seat].push(r.call.strain);
  }
  return {
    shown: last?.shown ?? { N: unknownHand(), E: unknownHand(), S: unknownHand(), W: unknownHand() },
    bidSuits,
    systemFor: (seat) => systemFor(systems, seat),
    key: `${deal.dealer}|${deal.vul}|${calls.map((c) => (c.kind === "bid" ? `${c.level}${c.strain}` : c.kind)).join(" ")}`,
  };
}

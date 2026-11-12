// The general rules, used once the specific ones have nothing to say: Blackwood, placing the
// contract from what the partnership has shown, and the fallback when no rule fits.

import type { Call } from "../../auction";
import { type Contract, type Strain, type Suit, STRAINS, SUITS } from "../../types";
import { contractTrickPoints } from "../../scoring";
import { type HandFacts, fitPoints, isMajor, supportPoints } from "../evaluate";
import type { CallRule } from "../model";
import {
  type Position,
  DOUBLE,
  PASS,
  canMake,
  bid,
  cheapBid,
  cheapest,
  fitWith,
  forced,
  gameLevel,
  isBid,
  isOurs,
  lastBid,
  myLast,
  ourActions,
  ourContract,
  ourSuits,
  partnerLast,
  partnerPoints,
  partnerShown,
  sameCall,
  theirSuits,
} from "../position";
import { SUIT_WORDS, SYMBOL, callName, rule, strainSymbol } from "./common";
import { stopper } from "../evaluate";

// ---- Blackwood ----------------------------------------------------------------------------------

export function slamRules(p: Position): CallRule[] {
  const pl = partnerLast(p);
  const me = myLast(p);
  if (pl?.rule?.name === "Blackwood") {
    return [
      rule(bid(5, "C"), "Answers Blackwood: no aces, or all four.", (h) => h.aces === 0 || h.aces === 4, { name: "Blackwood answer", why: (h) => `${h.aces} aces` }),
      rule(bid(5, "D"), "Answers Blackwood: one ace.", (h) => h.aces === 1, { name: "Blackwood answer", why: () => "one ace" }),
      rule(bid(5, "H"), "Answers Blackwood: two aces.", (h) => h.aces === 2, { name: "Blackwood answer", why: () => "two aces" }),
      rule(bid(5, "S"), "Answers Blackwood: three aces.", (h) => h.aces === 3, { name: "Blackwood answer", why: () => "three aces" }),
    ];
  }
  if (me?.rule?.name === "Blackwood" && pl?.rule?.name === "Blackwood answer" && isBid(pl.call)) {
    const answer = pl.call.strain;
    const trump = trumpSuit(p);
    const partnerAces = (h: HandFacts) => (answer === "C" ? (h.aces === 0 ? 4 : 0) : answer === "D" ? 1 : answer === "H" ? 2 : 3);
    const missing = (h: HandFacts) => 4 - h.aces - partnerAces(h);
    const out: CallRule[] = [];
    if (trump) {
      const five = bid(5, trump);
      out.push(
        rule(bid(7, trump), "Grand slam: no ace missing and plenty to spare.", (h) => missing(h) === 0 && h.hcp + partnerPoints(p).min >= 36, { why: () => "all four aces between us and enough strength for thirteen tricks" }),
        rule(bid(6, trump), "Small slam: at most one ace missing.", (h) => missing(h) <= 1, { why: (h) => `${missing(h) === 0 ? "no ace" : "one ace"} missing` }),
        ...(cheapest(p, trump) === 5 ? [rule(five, "Signs off: two aces missing.", () => true, { why: () => "two aces missing: stop at the five level" })] : []),
      );
    }
    out.push(rule(PASS, "Two aces missing: stops here.", () => true, { why: () => "two aces missing" }));
    return out;
  }
  return [];
}

/** The suit our side has agreed on, as far as the auction shows: our last bid suit with an 8-card fit, else our last bid suit. */
function trumpSuit(p: Position): Suit | null {
  const ps = p.shown[p.seat];
  const pp = partnerShown(p);
  const suits = ourSuits(p);
  const fits = suits.filter((s) => ps.len[s][0] + pp.len[s][0] >= 8);
  return fits.at(-1) ?? suits.at(-1) ?? null;
}

/** Doubles that ask partner to bid: the doubled contract won't be played, so it isn't worth anything to us. */
const BIDDING_DOUBLES = new Set(["Takeout double", "Negative double"]);

/** Our contract, if the opponents have just doubled it for penalties (and nobody has bid since). */
function doubledContract(p: Position): Contract | null {
  const lb = lastBid(p);
  if (!lb || !isOurs(p, lb.seat)) return null;
  const after = p.read.slice(p.read.indexOf(lb) + 1).filter((r) => r.call.kind !== "pass");
  const dbl = after.length === 1 && after[0]!.call.kind === "double" ? after[0]! : null;
  if (!dbl || BIDDING_DOUBLES.has(dbl.rule?.name ?? "")) return null;
  return { level: lb.call.level, strain: lb.call.strain, doubling: "X" };
}

/** "a 9+ card fit", "an 8+ card fit". */
const aOrAn = (n: number) => (n === 8 || n === 11 ? "an" : "a");

// ---- Placing the contract -----------------------------------------------------------------------

interface Plan {
  call: Call;
  why: string;
  /** Outbid past where we were heading: a judgement between these, for simulation to decide later. */
  hard?: NonNullable<CallRule["hard"]>;
}

const OUTBID_RULE = "when outbid: bid on if the Law of Total Tricks allows it, double if we hold most of the points, otherwise pass";

/**
 * Where should we play, from my hand and what partner has shown? Pick a strain (a major fit, then
 * notrump if balanced, then a minor fit, then a long suit), work out how high our combined values
 * go (25 for a major or notrump game, 29 for a minor, 33 slam, 37 grand), and bid that, or pass if
 * we're there already.
 */
function plan(p: Position, h: HandFacts): Plan {
  const ps = partnerShown(p);
  const pp = partnerPoints(p);
  const fit = fitWith(p, h);
  // Support points (5/3/1 for shortness) only when raising partner's suit: they've shown 4+ and
  // we're not longer. In our own long suit the hand counts as declarer does (h.points); once
  // partner has supported it, it counts shortness and extra trumps instead (fitPoints), the same
  // count opener uses to answer a raise.
  const raising = !!fit && ps.len[fit][0] >= 4 && h.len[fit] <= ps.len[fit][0];
  const supported = !!fit && !raising && ps.len[fit][0] >= 3;
  const mine = raising ? supportPoints(h, fit!) : supported ? fitPoints(h, fit!, p.shown[p.seat].len[fit!][0]) : h.points;
  /** "a 9+ card hearts fit" with partner's support, or just "6 hearts" for a suit of our own. */
  const fitWords = (s: Suit) =>
    ps.len[s][0] >= 2 ? `${aOrAn(h.len[s] + ps.len[s][0])} ${h.len[s] + ps.len[s][0]}+ card ${SUIT_WORDS[s]} fit` : `${h.len[s]} ${SUIT_WORDS[s]}`;
  const likely = mine + pp.likely;
  const least = mine + pp.min;
  const theirs = theirSuits(p);
  const stopped = theirs.every((t) => stopper(h, t));
  const ntOk = (h.semiBalanced || ps.balanced) && stopped;
  const longSuit = SUITS.find((s) => h.len[s] >= 6) ?? null;

  let strain: Strain;
  let why: string;
  if (fit && isMajor(fit)) {
    strain = fit;
    why = fitWords(fit);
  } else if (ntOk && (!fit || (likely >= 25 && likely < 29))) {
    strain = "NT";
    why = "no major fit, a balanced hand";
  } else if (fit) {
    strain = fit;
    why = fitWords(fit);
  } else if (longSuit) {
    strain = longSuit;
    why = `${h.len[longSuit]} ${SUIT_WORDS[longSuit]}`;
  } else {
    strain = "NT";
    why = "no fit found";
  }

  const points = `${mine} points here and about ${pp.likely} (${pp.min}${pp.max >= 37 ? "+" : `–${pp.max}`}) with partner`;
  const ours = ourContract(p);
  let game = gameLevel(strain);
  let target = likely >= 37 && least >= 35 ? 7 : likely >= 33 && least >= 31 ? 6 : likely >= (strain === "NT" || isMajor(strain as Suit) ? 25 : 29) ? game : likely >= 23 && least < 25 ? game - 1 : 0;
  const mustBid = forced(p);

  // Our own long suit: the tricks it takes by itself can go higher than the points say (a long
  // solid suit). Those tricks don't need partner's aces, so no Blackwood for them.
  let byTricks = false;
  if (strain !== "NT" && !raising && h.len[strain as Suit] >= 6 && h.tricks - 6 > target && h.tricks - 6 >= gameLevel(strain)) {
    target = Math.min(7, h.tricks - 6);
    byTricks = true;
    why = `${why}, ${h.tricks} playing tricks by itself`;
  }

  // They've doubled our part score, and doubled it's already a game (3♥× is 180 trick points): pass.
  // Bidding game instead can never score more, since we'd only bid it expecting to make it, and the
  // doubled contract then scores more with a trick to spare. Only a slam is worth bidding on for.
  const doubled = doubledContract(p);
  if (doubled && target < 6) {
    const trickPoints = contractTrickPoints(doubled).points;
    if (trickPoints >= 100) {
      return {
        call: PASS,
        why: `${callName({ kind: "bid", level: doubled.level, strain: doubled.strain })} doubled is already a game (${trickPoints / 2} doubled to ${trickPoints}), and scores more than bidding game would: pass`,
      };
    }
  }

  // Slam: ask for aces first, if there's a trump suit and room.
  if (!byTricks && target >= 6 && strain !== "NT" && cheapest(p, "NT") <= 4 && !ourActions(p).some((r) => r.rule?.name === "Blackwood")) {
    return { call: bid(4, "NT"), why: `${why}, ${points}: slam is likely, so check the aces first` };
  }
  if (target === 0) {
    if (ours && !mustBid) return { call: PASS, why: `${points}: no game, so stop here` };
    if (!mustBid && lastBid(p) && !isOurs(p, lastBid(p)!.seat)) return { call: PASS, why: `${points}: nothing more to say` };
    const b = cheapBid(p, strain);
    if (b && (b.level <= 3 || mustBid)) return { call: b, why: `${why}, ${points}: a part score` };
    return { call: PASS, why: `${points}: high enough already` };
  }
  // Game in notrump is out of reach (the bidding is past 3NT): play in our fit instead, or stop.
  // Not when we're already high enough in notrump, or in a game in any strain: that's a contract
  // to pass, not one we missed.
  const settled = !!ours && ours.level >= target && (ours.strain === "NT" || ours.level >= gameLevel(ours.strain));
  if (strain === "NT" && target < 6 && cheapest(p, "NT") > 3 && !settled) {
    if (fit) {
      strain = fit;
      why = `${fitWords(fit)}, past 3NT`;
    } else if (!mustBid) {
      return { call: PASS, why: `${points}: too high for game in notrump already` };
    }
  }
  game = gameLevel(strain);
  const inStrain = ours && ours.strain === strain;
  if (inStrain && ours!.level >= target) {
    return { call: PASS, why: `${why}, ${points}: ${ours!.level >= game ? "game is bid, which is high enough" : "we're high enough"}` };
  }
  if (ours && ours.level >= target && ours.level >= gameLevel(ours.strain) && !mustBid) return { call: PASS, why: `${points}: game is bid` };

  // Outbid past where we were heading: not ours to raise the stakes by rule, it's a judgement.
  const lb = lastBid(p);
  if (lb && !isOurs(p, lb.seat) && !mustBid && cheapest(p, strain) > target) return outbid(p, h, strain, mine, points);

  const level = Math.max(cheapest(p, strain), target);
  if (level > 7) return { call: PASS, why: `${points}: no room left` };
  if (target === game - 1 && level > target) {
    return mustBid ? { call: bid(level, strain), why: `${why}, ${points}` } : { call: PASS, why: `${why}, ${points}: not enough to go higher` };
  }
  const kind = level >= 7 ? "a grand slam" : level >= 6 ? "a small slam" : level >= game ? "game" : level === game - 1 ? "an invitation to game" : "a part score";
  return { call: bid(level, strain), why: `${why}, ${points}: ${kind}` };
}

/**
 * The opponents have bid past the level we were heading for. Bid on, double, or pass? By the Law of
 * Total Tricks (with N trumps between us, compete to the N−6 level) and the balance of points; a
 * hard call, which double-dummy simulation will decide later.
 */
function outbid(p: Position, h: HandFacts, strain: Strain, mine: number, points: string): Plan {
  const b = cheapBid(p, strain);
  const lb = lastBid(p)!;
  const canDouble = canMake(p, DOUBLE);
  const hard = { candidates: [PASS, ...(canDouble ? [DOUBLE] : []), ...(b ? [b] : [])], rule: OUTBID_RULE };
  const trumps = strain === "NT" ? 0 : h.len[strain as Suit] + partnerShown(p).len[strain as Suit][0];
  if (b && strain !== "NT" && trumps - 6 >= b.level) {
    return { call: b, hard, why: `${trumps} trumps between us: the Law of Total Tricks says we can bid to the ${trumps - 6} level` };
  }
  if (canDouble && lb.call.level >= 3 && mine + partnerPoints(p).min >= 23) {
    return { call: DOUBLE, hard, why: `${points}: most of the points are ours, and they've bid past us` };
  }
  const noBid = strain === "NT" ? "no fit to bid on in" : b ? `only ${trumps} trumps between us, not enough for ${callName(b)}` : "no room left to bid on";
  return { call: PASS, hard, why: `${points}: ${noBid}, and not enough points to double` };
}

export function placementRules(p: Position): CallRule[] {
  const candidates: { call: Call; meaning: string; name?: string }[] = [{ call: PASS, meaning: "Happy with the contract as it is." }];
  const suitAgreed = ourSuits(p).length > 0 && ourContract(p)?.strain !== "NT";
  candidates.push({ call: bid(4, "NT"), meaning: suitAgreed ? "Blackwood: asks partner how many aces they hold." : "Quantitative: invites 6NT.", name: suitAgreed ? "Blackwood" : "Quantitative 4NT" });
  for (const strain of STRAINS) {
    const g = gameLevel(strain);
    const sym = strainSymbol(strain);
    candidates.push(
      { call: bid(g - 1, strain), meaning: `Invites game in ${strain === "NT" ? "notrump" : sym}.` },
      { call: bid(g, strain), meaning: `Game in ${strain === "NT" ? "notrump" : sym}: enough values between us.` },
      { call: bid(6, strain), meaning: `Small slam in ${strain === "NT" ? "notrump" : sym}.` },
      { call: bid(7, strain), meaning: `Grand slam in ${strain === "NT" ? "notrump" : sym}.` },
    );
    const cheap = cheapBid(p, strain);
    if (cheap) candidates.push({ call: cheap, meaning: `Natural: suggests playing in ${strain === "NT" ? "notrump" : sym}.` });
  }
  const seen: Call[] = [];
  const rules: CallRule[] = [];
  // Outbid: the same calls as hard calls, matched only when the plan says it's that judgement.
  const lb = lastBid(p);
  if (lb && !isOurs(p, lb.seat) && ourActions(p).length > 0 && !forced(p)) {
    const outbidCalls: { call: Call; meaning: string }[] = [
      { call: PASS, meaning: "Lets them play it: not enough trumps to bid on, nor points to double." },
      { call: DOUBLE, meaning: "Penalty double: most of the points are ours, and they've bid past us." },
      ...STRAINS.filter((s) => s !== "NT")
        .map((s) => cheapBid(p, s))
        .filter((b): b is NonNullable<typeof b> => !!b)
        .map((b) => ({ call: b as Call, meaning: `Competes in ${strainSymbol(b.strain)}: enough trumps between us to go this high.` })),
    ];
    for (const c of outbidCalls) {
      rules.push(
        rule(c.call, c.meaning, (h) => {
          const pl = plan(p, h);
          return !!pl.hard && sameCall(pl.call, c.call);
        }, { name: "Competing", hard: { candidates: c.call.kind === "bid" ? [PASS, DOUBLE, c.call] : [PASS, DOUBLE], rule: OUTBID_RULE }, why: (h) => plan(p, h).why }),
      );
    }
  }
  for (const c of candidates) {
    if (seen.some((s) => sameCall(s, c.call))) continue;
    seen.push(c.call);
    rules.push(
      rule(c.call, c.meaning, (h) => sameCall(plan(p, h).call, c.call), {
        ...(c.name && { name: c.name }),
        ...(c.name === "Blackwood" && { forcing: "one round" as const }),
        why: (h) => plan(p, h).why,
      }),
    );
  }
  return rules;
}

// ---- Fallback -----------------------------------------------------------------------------------

export const NO_RULE = "No rule yet";

export function fallbackRules(p: Position): CallRule[] {
  const longest = (h: HandFacts): Strain => {
    const s = [...SUITS].sort((a, b) => h.len[b] - h.len[a])[0]!;
    return h.len[s] >= 5 || !h.semiBalanced ? s : "NT";
  };
  if (forced(p)) {
    return STRAINS.map((s) => cheapBid(p, s))
      .filter((b): b is NonNullable<typeof b> => !!b)
      .map((b) =>
        rule(b, `Natural: ${b.strain === "NT" ? "notrump" : `${SYMBOL[b.strain as Suit]} suit`}.`, (h) => longest(h) === b.strain, {
          name: NO_RULE,
          why: () => `No rule for this position yet. Partner's last bid was forcing, so the bot made the cheapest natural bid (${callName(b)}).`,
        }),
      );
  }
  return [rule(PASS, "Pass.", () => true, { name: NO_RULE, why: () => "No rule for this position yet, so the bot passed." })];
}

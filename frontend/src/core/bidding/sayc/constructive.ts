// Our side opened one of a suit: responder's first call, opener's rebid, and responder's second
// call, when the opponents have stayed out (or only passed). Later calls go to the general rules.

import { type Suit, SUITS } from "../../types";
import { type HandFacts, fitPoints, goodSuit, holding, isMajor, stopper, supportPoints, topHonours } from "../evaluate";
import type { CallRule } from "../model";
import type { SystemSettings } from "../system";
import {
  type Bid,
  type Position,
  PASS,
  bid,
  cheapBid,
  cheapest,
  isBid,
  ourActions,
  partnerPoints,
  partnerShown,
  theirActions,
} from "../position";
import { SUIT_WORDS, SYMBOL, cards, hcpText, len, rule, shapeText } from "./common";

export function constructiveRules(p: Position): CallRule[] {
  if (theirActions(p).length > 0) return [];
  const ours = ourActions(p);
  const open = ours[0];
  if (!open || !isBid(open.call) || open.call.level !== 1 || open.call.strain === "NT") return [];
  const iOpened = open.seat === p.seat;
  const o = open.call.strain as Suit;
  if (ours.length === 1 && !iOpened) return responses(p, o);
  if (ours.length === 2 && iOpened && isBid(ours[1]!.call)) return openerRebid(p, o, ours[1]!.call, ours[1]!.rule?.name, ours[1]!.forcing === "game");
  if (ours.length === 3 && !iOpened && isBid(ours[1]!.call) && isBid(ours[2]!.call)) {
    return responderRebid(p, o, ours[1]!.call, ours[2]!.call);
  }
  return [];
}

/** Responder's suit for a new-suit response: longest; five-five the higher; four-cards up the line. */
function newSuitChoice(h: HandFacts, candidates: Suit[]): Suit | null {
  const usable = candidates.filter((s) => h.len[s] >= 4);
  if (usable.length === 0) return null;
  const longest = Math.max(...usable.map((s) => h.len[s]));
  const top = usable.filter((s) => h.len[s] === longest);
  if (longest >= 5) return top[0]!; // SUITS order: higher-ranking first
  return top[top.length - 1]!; // four-card suits: the cheapest (up the line)
}

/** Opener's balanced rebid of 1NT: from 12 up to just below the 1NT opening. */
const rebidLow = (s: SystemSettings): [number, number] => [12, s.oneNtMin - 1];
/** Opener's balanced jump rebid in notrump: between the 1NT and 2NT openings. */
const rebidHigh = (s: SystemSettings): [number, number] => [s.oneNtMax + 1, Math.max(s.oneNtMax + 1, s.twoNtMin - 1)];
const rangeText = ([lo, hi]: [number, number]) => (lo === hi ? `${lo}` : `${lo}–${hi}`);

// ---- Responder's first call ---------------------------------------------------------------------

function responses(p: Position, o: Suit): CallRule[] {
  const s = p.s;
  const rules: CallRule[] = [];
  const major = isMajor(o);
  const sp = (h: HandFacts) => supportPoints(h, o);
  const fitLen = major ? 3 : o === "D" ? 4 : 5;

  rules.push(rule(PASS, "Fewer than 6 points: no game even opposite a good opening.", (h) => h.hcp < 6 && !(major && h.len[o] >= 5 && h.hcp >= 3), { shows: { hcp: [0, 5] }, why: (h) => `${hcpText(h)}: too weak to respond` }));

  if (major) {
    if (s.jacoby2Nt) {
      rules.push(
        rule(bid(2, "NT"), `Jacoby 2NT: 4+ ${SYMBOL[o]} and opening values (13+). Forcing to game.`, (h) => h.len[o] >= 4 && sp(h) >= 13, {
          name: "Jacoby 2NT",
          shows: { hcp: [11, 37], len: len(o, 4) },
          forcing: "game",
          why: (h) => `${h.len[o]} ${SUIT_WORDS[o]} and ${sp(h)} points counting shortness: game at least`,
        }),
      );
    }
    rules.push(
      // Lower limits on the hand tests below aren't needed: a hand under 6 HCP has already passed
      // (or, with 5+ trumps and 3+ HCP, bid 4M). What each call shows still states them, for partner.
      rule(bid(4, o), `Weak raise to game: 5+ ${SYMBOL[o]}, 3–9 HCP. Makes it hard for the opponents.`, (h) => h.len[o] >= 5 && h.hcp < 10, {
        shows: { hcp: [3, 9], len: len(o, 5) },
        why: (h) => `${h.len[o]} ${SUIT_WORDS[o]} and ${hcpText(h)}: bid game to keep the opponents out`,
      }),
      rule(bid(3, o), `Limit raise: 4+ ${SYMBOL[o]}, 10–12 points. Invites game.`, (h) => h.len[o] >= 4 && sp(h) >= 10 && sp(h) <= 12, {
        name: "Limit raise",
        shows: { hcp: [8, 12], len: len(o, 4) },
        why: (h) => `${h.len[o]} ${SUIT_WORDS[o]} and ${sp(h)} points counting shortness: invite game`,
      }),
      // With 10+ HCP and three trumps, responder bids a new suit first and supports later.
      rule(bid(2, o), `Single raise: 3+ ${SYMBOL[o]}, 6–9 HCP.`, (h) => h.len[o] >= 3 && h.hcp < 10, {
        shows: { hcp: [6, 9], len: len(o, 3) },
        why: (h) => `${h.len[o]} ${SUIT_WORDS[o]} and ${hcpText(h)}: support partner straight away`,
      }),
    );
  } else {
    rules.push(
      rule(bid(3, o), `Limit raise: ${cards(fitLen, o)}, 10–12 points, no 4-card major. Invites game.`, (h) => h.len[o] >= fitLen && h.hcp >= 10 && h.hcp <= 12 && h.len.H < 4 && h.len.S < 4, {
        shows: { hcp: [10, 12], len: len(o, fitLen) },
        why: (h) => `${h.len[o]} ${SUIT_WORDS[o]}, ${hcpText(h)} and no major to show`,
      }),
    );
  }

  // Jump shift: very strong.
  for (const t of SUITS.filter((x) => x !== o)) {
    const jump = cheapest(p, t) + 1;
    rules.push(
      rule(bid(jump, t), `Jump shift: 19+ points and a good 5+ card suit. Strong, forcing to game.`, (h) => h.hcp >= 19 && h.len[t] >= 5 && goodSuit(h, t) && newSuitChoice(h, SUITS.filter((x) => x !== o)) === t, {
        shows: { hcp: [19, 37], len: len(t, 5) },
        forcing: "game",
        why: (h) => `${hcpText(h)} and ${holding(h, t)}: slam is possible`,
      }),
    );
  }

  // New suit at the one level: 6+, 4+ cards, forcing.
  const oneLevel = SUITS.filter((t) => t !== o && cheapest(p, t) === 1);
  for (const t of oneLevel) {
    rules.push(
      rule(bid(1, t), `New suit: 4+ ${SYMBOL[t]}, 6+ points. Forcing for one round.`, (h) => {
        if (h.len[t] < 4) return false;
        // Over a minor, a weak hand shows a major before a longer diamond suit.
        const majors = oneLevel.filter((m) => isMajor(m));
        if (!major && h.hcp < 11 && majors.length && majors.some((m) => h.len[m] >= 4)) return newSuitChoice(h, majors) === t;
        return newSuitChoice(h, oneLevel) === t;
      }, {
        shows: { hcp: [6, 37], len: len(t, 4) },
        forcing: "one round",
        why: (h) => `${h.len[t]} ${SUIT_WORDS[t]} and ${hcpText(h)}: show the suit, partner must bid again`,
      }),
    );
  }

  if (!major) {
    rules.push(
      rule(bid(2, o), `Single raise: ${cards(fitLen, o)}, 6–10 points, no 4-card major.`, (h) => h.len[o] >= fitLen && h.hcp >= 6 && h.hcp <= 10 && h.len.H < 4 && h.len.S < 4, {
        shows: { hcp: [6, 10], len: len(o, fitLen) },
        why: (h) => `${h.len[o]} ${SUIT_WORDS[o]}, ${hcpText(h)} and no major to show`,
      }),
      rule(bid(3, "NT"), "16–18 HCP, balanced, no 4-card major.", (h) => h.balanced && h.hcp >= 16 && h.hcp <= 18 && h.len.H < 4 && h.len.S < 4, {
        shows: { hcp: [16, 18], balanced: true },
        why: (h) => `${hcpText(h)}, ${shapeText(h)}: game in notrump`,
      }),
      rule(bid(2, "NT"), "13–15 HCP, balanced, no 4-card major. Forcing to game.", (h) => h.balanced && h.hcp >= 13 && h.hcp <= 15 && h.len.H < 4 && h.len.S < 4, {
        shows: { hcp: [13, 15], balanced: true },
        forcing: "game",
        why: (h) => `${hcpText(h)}, ${shapeText(h)}: game values, balanced`,
      }),
    );
  }

  // Two over one: a new suit at the two level, 10+, forcing. Over a major, a minor can be three
  // cards (the last resort below), so that's all partner can count on.
  const twoLevel = SUITS.filter((t) => t !== o && cheapest(p, t) === 2);
  for (const t of twoLevel) {
    const need = o === "S" && t === "H" ? 5 : 4;
    const threeOk = major && !isMajor(t);
    rules.push(
      rule(bid(2, t), `New suit at the two level: ${cards(need, t)}${threeOk ? ` (3 when supporting ${SYMBOL[o]} with no 4-card suit to show)` : ""}, 10+ points. Forcing for one round.`, (h) => h.hcp >= 10 && h.len[t] >= need && newSuitChoice(h, twoLevel.filter((x) => h.len[x] >= (o === "S" && x === "H" ? 5 : 4))) === t, {
        shows: { hcp: [10, 37], len: len(t, threeOk ? 3 : need) },
        forcing: "one round",
        why: (h) => `${hcpText(h)} and ${h.len[t]} ${SUIT_WORDS[t]}: too strong for 1NT, so show the suit at the two level`,
      }),
    );
  }

  if (major) {
    rules.push(
      rule(bid(3, "NT"), `15–17 HCP, balanced, fewer than 3 ${SYMBOL[o]}.`, (h) => h.balanced && h.hcp >= 15 && h.hcp <= 17 && h.len[o] < 3, {
        shows: { hcp: [15, 17], balanced: true },
        why: (h) => `${hcpText(h)}, ${shapeText(h)}, no fit: game in notrump`,
      }),
    );
    // Last resort with 10+: support for the major but no 4-card suit to bid at the two level
    // (e.g. 3-4-3-3 over 1♠). Bid the longer minor on three cards (clubs when equal), to support
    // partner next. Partner reads it with the two-over-one rule above, which allows for this.
    for (const t of ["C", "D"] as Suit[]) {
      const other: Suit = t === "C" ? "D" : "C";
      rules.push(
        rule(bid(2, t), `New suit at the two level on three cards: support for ${SYMBOL[o]}, 10+ points, no 4-card suit to show. Forcing for one round.`, (h) => h.hcp >= 10 && (t === "C" ? h.len.C >= h.len.D : h.len.D > h.len.C), {
          shows: { hcp: [10, 37], len: len(t, 3) },
          forcing: "one round",
          why: (h) => `${hcpText(h)} and ${h.len[o]} ${SUIT_WORDS[o]}, but no 4-card suit to show: ${SYMBOL[t]} (${h.len[t]} cards, ${h.len[other]} ${SUIT_WORDS[other]}) first, then support partner`,
        }),
      );
    }
  }
  rules.push(
    rule(bid(1, "NT"), `6–10 points, nothing better to bid${major ? ` (fewer than 3 ${SYMBOL[o]})` : " (no 4-card major)"}. Not forcing.`, (h) => h.hcp <= 10, {
      shows: { hcp: [6, 10] },
      why: (h) => `${hcpText(h)}, no fit and no suit to show at the one level`,
    }),
  );
  return rules;
}

// ---- Opener's rebid -----------------------------------------------------------------------------

/** `gameForced`: partner's response forced to game (a jump shift), so a rebid shows shape, not strength. */
function openerRebid(p: Position, o: Suit, r: Bid, rName: string | undefined, gameForced: boolean): CallRule[] {
  const rules: CallRule[] = [];
  const rs = r.strain;
  const rebidOwn = (h: HandFacts) => h.len[o] >= 6;
  // Balanced hands that didn't open 1NT or 2NT: below the 1NT range (rebid 1NT), or between the two
  // (jump to 2NT). With 15–17 and 20–21, that's 12–14 and 18–19.
  const low = rebidLow(p.s);
  const high = rebidHigh(p.s);
  const balancedMin = (h: HandFacts) => h.balanced && h.hcp <= low[1];

  // Partner raised (or bid Jacoby 2NT): count the hand with the fit, shortness and extra trumps.
  const fp = (h: HandFacts) => fitPoints(h, o, p.shown[p.seat].len[o][0]);
  if (rs === o && r.level === 2) {
    return [
      rule(bid(4, o), "Bids game: enough opposite a single raise.", (h) => fp(h) >= 19 && isMajor(o), { why: (h) => `${fp(h)} points: game even opposite 6` }),
      rule(bid(3, o), "Invites game: 16–18 points.", (h) => fp(h) >= 16, { shows: { hcp: [15, 18] }, why: (h) => `${fp(h)} points: game if partner is at the top of the raise` }),
      rule(bid(3, "NT"), "Bids game in notrump.", (h) => !isMajor(o) && h.hcp >= 18 && h.balanced, { why: (h) => `${hcpText(h)} balanced` }),
      rule(PASS, "Minimum: no game opposite a single raise.", () => true, { why: (h) => `${fp(h)} points: game is unlikely` }),
    ];
  }
  const slamZone = (h: HandFacts) => isMajor(o) && fp(h) + partnerPoints(p).likely >= 31;
  if (rs === o && r.level === 3) {
    return [
      // A major game needs 26: 15 opposite the limit raise's likely 11 (the general rule's numbers).
      // With a major and slam possible (31+ with partner's likely), neither rule here applies, and
      // the general rules explore slam (an invitation, control bids or Blackwood).
      rule(bid(isMajor(o) ? 4 : 5, o), "Accepts the invitation.", (h) => fp(h) >= (isMajor(o) ? 15 : 14) && !slamZone(h), { why: (h) => `${fp(h)} points: more than a minimum` }),
      rule(bid(3, "NT"), "Accepts in notrump.", (h) => !isMajor(o) && h.hcp >= 14 && h.balanced, { why: () => "stoppers and extras: 3NT is easier than 5 of a minor" }),
      rule(PASS, "Declines: minimum.", (h) => fp(h) < (isMajor(o) ? 15 : 14) || !isMajor(o), { why: (h) => `${fp(h)} points: a minimum` }),
    ];
  }
  if (rName === "Jacoby 2NT") {
    const short = (h: HandFacts) => SUITS.find((x) => x !== o && h.len[x] <= 1) ?? null;
    return [
      ...SUITS.filter((x) => x !== o).map((x) =>
        rule(bid(3, x), `Shortness: a singleton or void in ${SYMBOL[x]}.`, (h) => short(h) === x, { name: "Jacoby 2NT answer", shows: { len: { [x]: [0, 1] } }, why: (h) => `a ${h.len[x] === 0 ? "void" : "singleton"} in ${SUIT_WORDS[x]}` }),
      ),
      rule(bid(3, o), "No shortness, 18+ points: slam interest.", (h) => fp(h) >= 18, { name: "Jacoby 2NT answer", shows: { hcp: [17, 21] }, why: (h) => `${fp(h)} points, no shortness` }),
      rule(bid(3, "NT"), "No shortness, 15–17 points.", (h) => fp(h) >= 15, { name: "Jacoby 2NT answer", shows: { hcp: [14, 17] }, why: (h) => `${fp(h)} points, no shortness` }),
      rule(bid(4, o), "No shortness, minimum: signs off in game.", () => true, { name: "Jacoby 2NT answer", shows: { hcp: [11, 14] }, why: () => "a minimum with no shortness" }),
    ];
  }

  // Partner bid 2NT (13–15, forcing to game) or 3NT (16–18) over a minor: balanced, no 4-card major.
  if (rs === "NT" && r.level >= 2) return afterNotrumpResponse(o, r.level === 2 ? [13, 15] : [16, 18]);

  // Partner bid 1NT (6–10).
  if (rs === "NT" && r.level === 1) {
    rules.push(
      rule(bid(2, "NT"), `${rangeText(high)} HCP, balanced: invites 3NT.`, (h) => h.balanced && h.hcp >= high[0], { shows: { hcp: high, balanced: true }, why: (h) => `${hcpText(h)}, balanced` }),
      rule(bid(3, o), `6+ ${SYMBOL[o]}, 16–18 points: invites game.`, (h) => rebidOwn(h) && h.points >= 16, { shows: { hcp: [15, 18], len: len(o, 6) }, why: (h) => `${h.len[o]} ${SUIT_WORDS[o]} and ${h.points} points` }),
    );
  } else if (r.level === 1) {
    // Partner bid a new suit at the one level: forcing.
    const t = rs as Suit;
    if (isMajor(t)) {
      rules.push(
        rule(bid(4, t), `4 ${SYMBOL[t]} and 19+ points: game.`, (h) => h.len[t] >= 4 && supportPoints(h, t) >= 19, { shows: { hcp: [18, 21], len: len(t, 4) }, why: (h) => `four ${SUIT_WORDS[t]} and ${supportPoints(h, t)} points` }),
        rule(bid(3, t), `4 ${SYMBOL[t]} and 16–18 points: invites game.`, (h) => h.len[t] >= 4 && supportPoints(h, t) >= 16, { shows: { hcp: [15, 18], len: len(t, 4) }, why: (h) => `four ${SUIT_WORDS[t]} and ${supportPoints(h, t)} points` }),
        rule(bid(2, t), `4 ${SYMBOL[t]}, minimum (12–15).`, (h) => h.len[t] >= 4, { shows: { hcp: [11, 15], len: len(t, 4) }, why: () => `four ${SUIT_WORDS[t]}: support partner's major` }),
      );
    }
    // A new suit at the one level (up the line).
    for (const x of SUITS.filter((x) => x !== o && x !== t && cheapest(p, x) === 1)) {
      rules.push(
        rule(bid(1, x), `4+ ${SYMBOL[x]}. Not forcing (but partner usually bids again).`, (h) => h.len[x] >= 4 && !(h.balanced && h.hcp <= low[1] && !isMajor(x)) && SUITS.filter((y) => y !== o && y !== t && cheapest(p, y) === 1 && h.len[y] >= 4).at(-1) === x, {
          shows: { len: len(x, 4) },
          why: (h) => `${h.len[x]} ${SUIT_WORDS[x]}: show it at the one level`,
        }),
      );
    }
    rules.push(
      rule(bid(2, "NT"), `${rangeText(high)} HCP, balanced.`, (h) => h.balanced && h.hcp >= high[0], { shows: { hcp: high, balanced: true }, why: (h) => `${hcpText(h)}, balanced` }),
      rule(bid(1, "NT"), `${rangeText(low)} HCP, balanced.`, balancedMin, { shows: { hcp: low, balanced: true }, why: (h) => `${hcpText(h)}, ${shapeText(h)}: too weak for a 1NT opening, so rebid it` }),
    );
  } else {
    // Partner bid a new suit at the two level (10+, forcing).
    const t = rs as Suit;
    rules.push(
      rule(bid(3, t), `Raises: ${cards(isMajor(t) ? 3 : 4, t)}.`, (h) => h.len[t] >= (isMajor(t) ? 3 : 4), { shows: { len: len(t, isMajor(t) ? 3 : 4) }, why: (h) => `${h.len[t]} ${SUIT_WORDS[t]}: support` }),
      rule(bid(2, "NT"), `${rangeText(low)} HCP, balanced, stoppers in the unbid suits.`, (h) => h.balanced && h.hcp <= low[1], { shows: { hcp: low, balanced: true }, why: (h) => `${hcpText(h)}, balanced` }),
      rule(bid(3, "NT"), `${rangeText(high)} HCP, balanced.`, (h) => h.balanced && h.hcp >= high[0], { shows: { hcp: high, balanced: true }, why: (h) => `${hcpText(h)}, balanced` }),
    );
  }

  // Rebid your own suit, show a second suit, reverse, or jump.
  const second = (h: HandFacts, cheap: boolean) =>
    SUITS.filter((x) => x !== o && x !== rs && h.len[x] >= 4).find((x) => {
      const level = cheapest(p, x);
      const reverse = level === 2 && SUITS.indexOf(x) < SUITS.indexOf(o);
      return cheap ? !reverse && level === 2 : reverse;
    }) ?? null;
  // The jump rebid (1♦–1♠–3♦) only when 3 of our suit really is a jump. Not after a jump shift:
  // game is forced then, so there's nothing to invite.
  if (cheapest(p, o) === 2 && !gameForced) {
    rules.push(
      rule(bid(3, o), `6+ ${SYMBOL[o]}, 16–18 points: invites game.`, (h) => rebidOwn(h) && h.points >= 16, { shows: { hcp: [15, 18], len: len(o, 6) }, why: (h) => `${h.len[o]} ${SUIT_WORDS[o]} and ${h.points} points: a jump rebid` }),
    );
  }
  for (const x of SUITS.filter((x) => x !== o && x !== rs)) {
    const b = cheapBid(p, x);
    if (!b || b.level !== 2) continue;
    const reverse = SUITS.indexOf(x) < SUITS.indexOf(o);
    rules.push(
      reverse
        ? rule(b, `Reverse: 16+ points, longer ${SYMBOL[o]} than ${SYMBOL[x]}. Forcing for one round.`, (h) => h.points >= 16 && h.len[x] >= 4 && h.len[o] > h.len[x] && second(h, false) === x, {
            name: "Reverse",
            shows: { hcp: [16, 21], len: len(x, 4) },
            forcing: "one round",
            why: (h) => `${h.points} points with ${h.len[o]} ${SUIT_WORDS[o]} and ${h.len[x]} ${SUIT_WORDS[x]}: strong enough to reverse`,
          })
        : rule(b, `4+ ${SYMBOL[x]}, 12–18 points. Not forcing.`, (h) => h.len[x] >= 4 && second(h, true) === x && !(h.len[o] >= 6 && h.len[x] < 5), {
            shows: { len: len(x, 4) },
            why: (h) => `${h.len[x]} ${SUIT_WORDS[x]} as a second suit`,
          }),
    );
  }
  const own = cheapBid(p, o);
  if (own) {
    rules.push(
      gameForced
        ? rule(own, `6+ ${SYMBOL[o]}. Game is already forced, so this shows the suit, not the strength.`, (h) => rebidOwn(h), { shows: { len: len(o, 6) }, why: (h) => `${h.len[o]} ${SUIT_WORDS[o]}: show the long suit` })
        : rule(own, `6+ ${SYMBOL[o]}, minimum (12–15).`, (h) => rebidOwn(h), { shows: { hcp: [11, 15], len: len(o, 6) }, why: (h) => `${h.len[o]} ${SUIT_WORDS[o]}, a minimum` }),
    );
  }
  if (rs === "NT") {
    rules.push(rule(PASS, "Minimum and balanced: 1NT is fine.", (h) => h.semiBalanced && h.points <= 16, { why: (h) => `${h.points} points: no game opposite 6–10` }));
  }
  if (own) {
    rules.push(
      rule(own, gameForced ? `Rebids ${SYMBOL[o]}: nothing else to show yet (5 cards). Game is already forced.` : `Rebids ${SYMBOL[o]}: a minimum with nothing else to show (5 cards).`, () => true, {
        shows: { len: len(o, 5) },
        why: () => "nothing better to bid",
      }),
    );
  }
  return rules;
}

/** A long suit that should run with little help: 7+ cards with two of the top three honours, or 6 with all three. */
const runningSuit = (h: HandFacts, s: Suit) => (h.len[s] >= 7 && topHonours(h, s) >= 2) || (h.len[s] >= 6 && topHonours(h, s) === 3);

/**
 * Opener's rebid after 1♣ or 1♦ and partner's 2NT (13–15, forcing to game) or 3NT (16–18): we're
 * in game at least, so every bid is about which game, or slam. Points here count length (a long
 * suit is worth tricks); 33 between us is a small slam, 37 a grand.
 */
function afterNotrumpResponse(o: Suit, partner: [number, number]): CallRule[] {
  const [lo, hi] = partner;
  const together = (h: HandFacts) => `${h.points} points here and ${lo}–${hi} with partner: ${h.points + lo}–${h.points + hi} together`;
  const slamShape = (h: HandFacts) => h.semiBalanced || runningSuit(h, o);
  const forcing = lo === 13;
  return [
    rule(bid(7, "NT"), "Grand slam in notrump: enough between us for all thirteen tricks.", (h) => h.points + lo >= 37 && slamShape(h), {
      why: (h) => `${together(h)}: enough for a grand slam`,
    }),
    rule(bid(6, "NT"), "Small slam in notrump: enough between us.", (h) => h.points + lo >= 33 && slamShape(h), {
      why: (h) =>
        runningSuit(h, o)
          ? `${together(h)}, and ${holding(h, o)} should run with little help from partner: slam`
          : `${together(h)}: slam even opposite a minimum`,
    }),
    rule(bid(4, "NT"), "Quantitative: invites 6NT. Balanced, with extra strength. Not Blackwood: no suit is agreed.", (h) => h.semiBalanced && h.points + hi >= 33, {
      name: "Quantitative 4NT",
      why: (h) => `${together(h)}: slam if partner is at the top of the range`,
    }),
    ...(forcing
      ? [
          rule(bid(4, o), `Natural: 6+ ${SYMBOL[o]}, slam interest. Goes past 3NT, so asks partner to think about slam.`, (h) => h.len[o] >= 6 && h.points + hi >= 33, {
            shows: { len: len(o, 6) },
            forcing: "one round" as const,
            why: (h: HandFacts) => `${h.len[o]} ${SUIT_WORDS[o]} and ${together(h)}: slam is possible`,
          }),
          rule(bid(3, o), `Natural: 6+ ${SYMBOL[o]}, forcing. A long suit and more than a minimum; partner raises with support.`, (h) => h.len[o] >= 6 && h.points >= 15, {
            shows: { len: len(o, 6) },
            forcing: "one round" as const,
            why: (h: HandFacts) => `${h.len[o]} ${SUIT_WORDS[o]} and ${h.points} points: show the long suit; game is already forced`,
          }),
          ...SUITS.filter((x) => x !== o).map((x) =>
            rule(bid(3, x), `Natural: 4+ ${SYMBOL[x]}, an unbalanced hand. Forcing.`, (h) => h.len[x] >= 4 && !h.semiBalanced, {
              shows: { len: len(x, 4) },
              forcing: "one round" as const,
              why: (h: HandFacts) => `${h.len[x]} ${SUIT_WORDS[x]} as a second suit, and an unbalanced hand`,
            }),
          ),
          rule(bid(3, "NT"), "To play: no slam interest.", () => true, { why: (h: HandFacts) => `${together(h)}: game, not slam` }),
        ]
      : [rule(PASS, "To play: 3NT is enough.", () => true, { why: (h: HandFacts) => `${together(h)}: game, not slam` })]),
  ];
}

// ---- Responder's second call --------------------------------------------------------------------

/**
 * Responder bid 2NT over 1♣ or 1♦ (13–15, balanced, forcing to game), and opener has rebid. 3NT or
 * a slam is to play; a quantitative 4NT asks for a maximum; opener's suit at the three or four
 * level asks for support, which takes us towards slam (opener then asks for aces).
 */
function afterOpenerOverTwoNotrump(p: Position, o: Suit, rebid: Bid): CallRule[] {
  const max = (h: HandFacts) => h.hcp >= 15 || (h.hcp >= 14 && h.aces >= 2);
  if (rebid.strain === "NT") {
    if (rebid.level === 4) {
      return [
        rule(bid(6, "NT"), "Accepts the slam invitation: the top of the 2NT range.", max, { why: (h) => `${hcpText(h)}: the top of 13–15` }),
        rule(PASS, "Declines the slam invitation.", () => true, { why: (h) => `${hcpText(h)}: not the top of 13–15` }),
      ];
    }
    return [rule(PASS, "Partner has chosen the contract.", () => true, { why: () => "partner placed the contract" })];
  }
  if (rebid.strain === o) {
    const fit = (h: HandFacts) => h.len[o] >= 3;
    if (rebid.level === 3) {
      return [
        rule(bid(4, o), `Support for ${SYMBOL[o]}: 3+ cards. Cooperates with partner's slam interest.`, fit, {
          shows: { len: len(o, 3) },
          forcing: "one round",
          why: (h) => `${h.len[o]} ${SUIT_WORDS[o]} with partner's long suit: a fit, and slam may be on`,
        }),
        rule(bid(3, "NT"), `No fit for ${SYMBOL[o]}: game in notrump.`, () => true, { why: (h) => `only ${h.len[o]} ${SUIT_WORDS[o]}: notrump` }),
      ];
    }
    if (rebid.level === 4) {
      return [
        rule(bid(6, o), `Slam in ${SYMBOL[o]}: a fit and the top of the range.`, (h) => fit(h) && max(h), { why: (h) => `${h.len[o]} ${SUIT_WORDS[o]} and ${hcpText(h)}` }),
        rule(bid(5, o), `Game in ${SYMBOL[o]}: no extra to offer.`, () => true, { why: (h) => `${hcpText(h)}: not enough for slam opposite partner's try` }),
      ];
    }
  }
  // Opener showed a new suit: raise it with four, otherwise 3NT.
  const x = rebid.strain as Suit;
  return [
    rule(bid(4, x), `Support for ${SYMBOL[x]}: 4+ cards.`, (h) => h.len[x] >= 4 && cheapest(p, x) === 4, { shows: { len: len(x, 4) }, forcing: "one round", why: (h) => `${h.len[x]} ${SUIT_WORDS[x]}: a fit` }),
    rule(bid(3, "NT"), "Game in notrump.", () => cheapest(p, "NT") === 3, { why: () => "no fit in the new suit: notrump" }),
  ];
}

function responderRebid(p: Position, o: Suit, r: Bid, rebid: Bid): CallRule[] {
  if (r.strain === "NT" && r.level === 2 && !isMajor(o)) return afterOpenerOverTwoNotrump(p, o, rebid);
  const ps = partnerShown(p);
  const rules: CallRule[] = [];
  const minOpener = Math.max(ps.hcp[0], 12);
  // Opener rebid 1NT (below the 1NT opening range: 12–14 with 15–17) after a one-level response.
  const low = rebidLow(p.s);
  if (rebid.strain === "NT" && rebid.level === 1) {
    const mine = r.strain as Suit;
    rules.push(
      rule(bid(3, "NT"), `${25 - low[0]}+ HCP: game opposite ${rangeText(low)}.`, (h) => h.hcp >= 25 - low[0], { why: (h) => `${hcpText(h)} + ${rangeText(low)} is enough for game` }),
      rule(bid(4, mine), `6+ ${SYMBOL[mine]} and game values.`, (h) => isMajor(mine) && h.len[mine] >= 6 && h.hcp >= 12, { why: (h) => `${h.len[mine]} ${SUIT_WORDS[mine]} and ${hcpText(h)}` }),
      rule(bid(2, "NT"), `${25 - low[1]}–${24 - low[0]} HCP: invites 3NT.`, (h) => h.hcp >= 25 - low[1], { shows: { hcp: [25 - low[1], 24 - low[0]] }, why: (h) => `${hcpText(h)}: game if opener has ${low[1]}` }),
      rule(bid(2, mine), `6+ ${SYMBOL[mine]}, weak: to play.`, (h) => h.len[mine] >= 6 && h.hcp <= 10, { shows: { hcp: [6, 10], len: len(mine, 6) }, why: (h) => `${h.len[mine]} ${SUIT_WORDS[mine]}: play in the long suit` }),
      rule(bid(2, o), `Back to opener's suit: weak, with ${SYMBOL[o]} support and an unbalanced hand.`, (h) => h.len[o] >= 4 && !h.semiBalanced && cheapest(p, o) === 2, { why: (h) => `${h.len[o]} ${SUIT_WORDS[o]}: the safer part score` }),
      rule(PASS, "Weak: 1NT is high enough.", () => true, { why: (h) => `${hcpText(h)}: no game opposite ${rangeText(low)}` }),
    );
    return rules;
  }
  // Opener raised my major.
  if (rebid.strain === r.strain && isMajor(r.strain as Suit)) {
    const m = r.strain as Suit;
    const level = rebid.level;
    const need = 25 - (level === 2 ? 14 : level === 3 ? 17 : 20);
    if (level < 4) {
      rules.push(
        rule(bid(4, m), "Bids game.", (h) => supportPoints(h, m) >= need, { why: (h) => `${supportPoints(h, m)} points: enough opposite opener's raise` }),
        ...(level === 2 ? [rule(bid(3, m), "Invites game.", (h) => supportPoints(h, m) >= need - 2, { why: (h: HandFacts) => `${supportPoints(h, m)} points: game if opener is not minimum` })] : []),
        rule(PASS, "Not enough for game.", () => true, { why: (h) => `${hcpText(h)}: stop here` }),
      );
      return rules;
    }
  }
  // A new suit at the one level (1♣–1♦–1♥–1♠): natural, 4+ cards, forcing for one round. It's the
  // fourth suit, but fourth suit forcing only makes it artificial from the two level up. Not with
  // four cards in opener's second suit, a major: raising it comes first.
  const named = [o, r.strain, rebid.strain];
  for (const x of SUITS.filter((x) => !named.includes(x) && cheapest(p, x) === 1)) {
    rules.push(
      rule(bid(1, x), `New suit: 4+ ${SYMBOL[x]}. Natural, forcing for one round.`, (h) => h.len[x] >= 4 && !(rebid.strain !== "NT" && isMajor(rebid.strain as Suit) && h.len[rebid.strain as Suit] >= 4), {
        shows: { len: len(x, 4) },
        forcing: "one round",
        why: (h) => `${h.len[x]} ${SUIT_WORDS[x]}: show them at the one level before choosing a contract`,
      }),
    );
  }
  // Opener rebid their own suit, or showed a second suit (not forcing): place the contract.
  const fitO = (h: HandFacts) => h.len[o] >= (isMajor(o) ? 3 : 4) || (rebid.strain === o && h.len[o] >= 2);
  const total = (h: HandFacts) => h.hcp + minOpener;
  const opener2 = rebid.strain !== o && rebid.strain !== r.strain && rebid.strain !== "NT" ? (rebid.strain as Suit) : null;
  rules.push(
    rule(bid(4, o), `Game in opener's ${SYMBOL[o]}.`, (h) => isMajor(o) && fitO(h) && total(h) >= 25, { why: (h) => `${h.len[o]} ${SUIT_WORDS[o]} and ${hcpText(h)}: game` }),
    rule(bid(3, "NT"), "Game in notrump.", (h) => total(h) >= 25 && SUITS.filter((x) => x !== o && x !== r.strain && x !== opener2).every((x) => stopper(h, x)), { why: (h) => `${hcpText(h)} and stoppers in the unbid suits` }),
    // 3+ cards in opener's major and 10–12 support points: the limit raise that waited a round
    // (1♠–2♦–2♠–3♠). Below game, so 13+ has already bid 4M above.
    ...(isMajor(o)
      ? [
          rule(bid(3, o), `Invites game in ${SYMBOL[o]}: 3+ ${SYMBOL[o]}, 10–12 points.`, (h) => h.len[o] >= 3 && supportPoints(h, o) >= 10 && cheapest(p, o) <= 3, {
            shows: { hcp: [8, 12], len: len(o, 3) },
            why: (h: HandFacts) => `${h.len[o]} ${SUIT_WORDS[o]} and ${supportPoints(h, o)} points counting shortness: invite`,
          }),
        ]
      : []),
    rule(bid(3, o), `Invites game in ${SYMBOL[o]}.`, (h) => fitO(h) && total(h) >= 23 && cheapest(p, o) <= 3, { why: (h) => `${h.len[o]} ${SUIT_WORDS[o]} and ${hcpText(h)}: invite` }),
    rule(bid(2, "NT"), "Invites 3NT: 11–12 HCP.", (h) => h.hcp >= 11 && h.hcp <= 12 && cheapest(p, "NT") === 2, { shows: { hcp: [11, 12] }, why: (h) => `${hcpText(h)}: invite` }),
  );
  if (opener2) {
    rules.push(
      // Weak: with 11+ responder would have invited above. Two cards only when equal in both suits.
      rule(bid(cheapest(p, o), o), `Preference: back to opener's first suit, ${SYMBOL[o]}. 6–10 points, 2+ ${SYMBOL[o]}.`, (h) => h.len[o] > h.len[opener2] || (h.len[o] === h.len[opener2] && h.len[o] >= 2), { shows: { hcp: [6, 10], len: len(o, 2) }, why: (h) => `${h.len[o]} ${SUIT_WORDS[o]} against ${h.len[opener2]} ${SUIT_WORDS[opener2]}: prefer the first suit` }),
    );
  }
  rules.push(rule(PASS, "Weak: no game, and this contract will do.", () => true, { why: (h) => `${hcpText(h)}: stop` }));
  return rules;
}

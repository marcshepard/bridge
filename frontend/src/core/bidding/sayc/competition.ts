// Competitive bidding: when the opponents are in the auction. Overcalls and takeout doubles over
// their opening, partner's replies to those (advancing), responder's and opener's calls when they
// overcall or double our opening, and the contested part-score decisions (the hard calls).

import { type Suit, SUITS } from "../../types";
import { type HandFacts, decentSuit, goodSuit, holding, isMajor, stopper, supportPoints, topHonours } from "../evaluate";
import type { CallRule, ReadCall } from "../model";
import {
  type Bid,
  type Position,
  DOUBLE,
  PASS,
  actionsBy,
  bid,
  bids,
  cheapBid,
  cheapest,
  isBid,
  isNatural,
  isOurs,
  lastBid,
  ourActions,
  partner,
  partnerShown,
  rhoCall,
  theirActions,
  theirSuits,
  weVul,
} from "../position";
import { SUIT_WORDS, SYMBOL, callName, cards, hcpText, len, rule } from "./common";

export function competitiveRules(p: Position): CallRule[] {
  const theirs = theirActions(p);
  if (theirs.length === 0) return [];
  const ours = ourActions(p);
  const first = bids(p)[0];
  if (!first) return [];
  const weOpened = isOurs(p, first.seat);
  const mine = actionsBy(p, p.seat);
  const partners = actionsBy(p, partner(p));

  // Partner's action, if it was their last call (just before the right-hand opponent's).
  const justActed = p.read.at(-2)?.seat === partner(p) && p.read.at(-2)!.call.kind !== "pass";
  if (!weOpened) {
    if (ours.length === 0 && lastBid(p)!.call.level <= 3) return overcalls(p);
    if (mine.length === 0 && partners.length === 1 && justActed) return advances(p, partners[0]!);
    if (mine.length === 1 && mine[0]!.rule?.name === "Michaels" && partners.length === 1 && partners[0]!.call.kind === "bid" && partners[0]!.call.strain === "NT") {
      return michaelsMinor();
    }
  } else {
    if (p.read.filter((r) => r.seat === p.seat).length === 0 && partners.length === 1 && justActed && isBid(partners[0]!.call) && partners[0]!.call.level === 1) {
      return responderInCompetition(p, partners[0]!.call.strain as Suit);
    }
    if (mine.length === 1 && partners.length === 1 && partners[0]!.rule?.name === "Negative double") {
      return afterNegativeDouble(p, mine[0]!.call as Bid);
    }
  }
  return contested(p);
}

/** The opponents' suit to act over: the last suit they bid naturally. */
function theirSuit(p: Position): Suit | null {
  return theirSuits(p).at(-1) ?? null;
}

/** If I pass now, the auction ends (I'm in the balancing seat). */
function balancing(p: Position): boolean {
  const n = p.read.length;
  return n >= 3 && p.read[n - 1]!.call.kind === "pass" && p.read[n - 2]!.call.kind === "pass" && !!lastBid(p);
}

// ---- Over their opening: overcalls and doubles --------------------------------------------------

function overcalls(p: Position): CallRule[] {
  const lb = lastBid(p)!;
  const t = theirSuit(p);
  const balance = balancing(p);
  const adj = balance ? 3 : 0;
  const s = p.s;
  const rules: CallRule[] = [];
  const unbid = SUITS.filter((x) => x !== t);

  if (lb.call.strain === "NT") {
    // Over their 1NT: double is for penalties; a long suit can overcall.
    rules.push(
      rule(DOUBLE, "Penalty double: as strong as their 1NT or stronger.", (h) => h.hcp >= 15 + (lb.call.level > 1 ? 1 : 0) - adj, { shows: { hcp: [15 - adj, 37] }, why: (h) => `${hcpText(h)}: more than their notrump range` }),
    );
    for (const x of SUITS) {
      const b = cheapBid(p, x);
      if (!b || b.level > 3) continue;
      rules.push(rule(b, `Natural overcall: 6+ ${SYMBOL[x]} (or a good 5), 8–15 HCP.`, (h) => h.len[x] >= 6 && decentSuit(h, x) && h.hcp >= 8 - adj && h.hcp <= 15, { shows: { hcp: [8 - adj, 15], len: len(x, 5) }, why: (h) => `${holding(h, x)}: a long suit to compete with` }));
    }
    rules.push(rule(PASS, "Nothing to say over their notrump.", () => true, { why: (h) => `${hcpText(h)}: pass` }));
    return rules;
  }

  if (!t) return overArtificial(p);
  const level = lb.call.level;

  if (level === 1) {
    rules.push(
      rule(bid(1, "NT"), `${15 - adj}–${18 - adj} HCP, balanced, with a ${SYMBOL[t]} stopper.`, (h) => h.balanced && h.hcp >= 15 - adj && h.hcp <= 18 - adj && stopper(h, t), {
        shows: { hcp: [15 - adj, 18 - adj], balanced: true },
        why: (h) => `${hcpText(h)}, balanced, ${holding(h, t)} stops their suit`,
      }),
    );
    if (s.michaels && cheapest(p, t) === 2 && !balance) {
      const mic = (h: HandFacts) =>
        isMajor(t)
          ? h.len[t === "H" ? "S" : "H"] >= 5 && (h.len.C >= 5 || h.len.D >= 5)
          : h.len.H >= 5 && h.len.S >= 5;
      rules.push(
        rule(bid(2, t), isMajor(t) ? `Michaels: 5+ ${SYMBOL[t === "H" ? "S" : "H"]} and a 5+ card minor.` : "Michaels: 5+ ♥ and 5+ ♠.", (h) => mic(h) && h.hcp >= 8, {
          name: "Michaels",
          shows: isMajor(t) ? { hcp: [8, 37], len: len(t === "H" ? "S" : "H", 5) } : { hcp: [8, 37], len: { H: [5, 13], S: [5, 13] } },
          forcing: "one round",
          why: () => "a two-suiter: show both suits in one bid",
        }),
      );
    }
    if (s.unusualNt && !balance) {
      const [a, b] = SUITS.filter((x) => x !== t).reverse().slice(0, 2) as [Suit, Suit];
      rules.push(
        rule(bid(2, "NT"), `Unusual 2NT: 5+ ${SYMBOL[a]} and 5+ ${SYMBOL[b]}.`, (h) => h.len[a] >= 5 && h.len[b] >= 5 && h.hcp >= 8, {
          name: "Unusual 2NT",
          shows: { hcp: [8, 37], len: { [a]: [5, 13], [b]: [5, 13] } },
          forcing: "one round",
          why: () => `five-five in ${SUIT_WORDS[a]} and ${SUIT_WORDS[b]}`,
        }),
      );
    }
  }

  const takeout = (h: HandFacts) =>
    h.hcp >= 17 || (h.hcp >= 12 - adj + (level >= 2 ? 1 : 0) && h.len[t] <= 2 && unbid.every((x) => h.len[x] >= 3) && unbid.filter(isMajor).every((x) => h.len[x] >= 3));
  rules.push(
    rule(DOUBLE, `Takeout double: opening values, short in ${SYMBOL[t]}, support for the other suits. Asks partner to bid.`, takeout, {
      name: "Takeout double",
      shows: { hcp: [12 - adj, 37], len: { [t]: [0, 3] } },
      forcing: "one round",
      why: (h) => (h.hcp >= 17 ? `${hcpText(h)}: too strong for a simple overcall` : `${hcpText(h)}, ${h.len[t]} ${SUIT_WORDS[t]} and support for the rest`),
    }),
  );

  // Natural overcalls: weak jumps first (they're more specific), then simple ones.
  for (const x of unbid) {
    const b = cheapBid(p, x);
    if (!b) continue;
    if (s.weakJumpOvercalls && !balance && b.level <= 3) {
      rules.push(
        rule(bid(b.level + 1, x), `Weak jump overcall: a good 6-card ${SYMBOL[x]} suit, 5–10 HCP. Like a weak two.`, (h) => h.len[x] >= 6 && h.hcp >= 5 && h.hcp <= 10 && goodSuit(h, x) && b.level + 1 <= 3, {
          name: "Weak jump overcall",
          shows: { hcp: [5, 10], len: len(x, 6) },
          why: (h) => `${hcpText(h)} and ${holding(h, x)}: get in their way`,
        }),
      );
    }
    const need = b.level === 1 ? { lo: 8 - adj, len: 5 } : b.level === 2 ? { lo: 11 - adj, len: 5 } : { lo: 13 - adj, len: 6 };
    rules.push(
      rule(b, `Overcall: ${cards(need.len, x)}, ${need.lo}–17 HCP${b.level >= 2 ? ", a good suit" : ""}.`, (h) => h.len[x] >= need.len && h.hcp >= need.lo && h.hcp <= 17 && (b.level === 1 ? decentSuit(h, x) : goodSuit(h, x) || h.len[x] >= 6), {
        shows: { hcp: [need.lo, 17], len: len(x, need.len) },
        why: (h) => `${hcpText(h)} and ${holding(h, x)}`,
      }),
    );
  }
  if (level === 2 || level === 3) {
    rules.push(
      rule(bid(level === 2 ? 2 : 3, "NT"), `Natural: 15–18 HCP, balanced, ${SYMBOL[t]} stopped.`, (h) => h.balanced && h.hcp >= 15 && h.hcp <= 18 && stopper(h, t), { shows: { hcp: [15, 18], balanced: true }, why: (h) => `${hcpText(h)}, ${holding(h, t)} stops their suit` }),
    );
  }
  rules.push(rule(PASS, "Nothing worth showing over their bid.", () => true, { why: (h) => `${hcpText(h)}: no suit or shape to compete with` }));
  return rules;
}

/**
 * Over a conventional bid (a strong 2♣, Stayman, a transfer): their bid names no suit they hold, so
 * any suit can be shown, the named one included. A good five-card suit with 8+ HCP overcalls at the
 * cheapest level; a good suit of six or more preempts, as high as the highest of: the cheapest
 * level, its length less four (six cards: the two level, as a weak two; seven: three), and its
 * playing tricks plus 2 vulnerable or 3 not (the rule of 2 and 3). Seven at most.
 */
function overArtificial(p: Position): CallRule[] {
  const allowance = weVul(p) ? 2 : 3;
  const qualifies = (h: HandFacts, x: Suit) => goodSuit(h, x) && (h.len[x] >= 6 || (h.len[x] >= 5 && h.hcp >= 8));
  const suitFor = (h: HandFacts): Suit | null =>
    SUITS.filter((x) => qualifies(h, x)).sort((a, b) => h.len[b] - h.len[a] || SUITS.indexOf(a) - SUITS.indexOf(b))[0] ?? null;
  const levelFor = (h: HandFacts, x: Suit): number => {
    const cheap = cheapest(p, x);
    if (h.len[x] < 6) return cheap;
    return Math.min(7, Math.max(cheap, h.len[x] - 4, h.tricks + allowance - 6));
  };
  const rules: CallRule[] = [];
  for (const x of SUITS) {
    const cheap = cheapest(p, x);
    for (let level = cheap; level <= 7; level++) {
      rules.push(
        rule(
          bid(level, x),
          level === cheap
            ? `Natural overcall: a good suit of 5+ ${SYMBOL[x]}. Their bid was conventional, so it doesn't stop us showing any suit.`
            : `Preemptive: a long, good ${SYMBOL[x]} suit. The higher the bid, the longer the suit and the more tricks it takes.`,
          (h) => suitFor(h) === x && levelFor(h, x) === level,
          {
            shows: { len: len(x, level === cheap ? 5 : 6) },
            why: (h) => {
              const lengthLevel = h.len[x] - 4;
              const trickLevel = h.tricks + allowance - 6;
              return level === cheap
                ? `${holding(h, x)} and ${hcpText(h)}: show the suit`
                : `${holding(h, x)}: ${h.len[x]} cards (the ${Math.min(7, lengthLevel)} level by length) and ${h.tricks} playing tricks (the ${Math.min(7, trickLevel)} level, overbidding by ${allowance} ${weVul(p) ? "vulnerable" : "not vulnerable"}): bid the higher`;
            },
          },
        ),
      );
    }
  }
  rules.push(rule(PASS, "Nothing to show over their conventional bid.", () => true, { why: (h) => `${hcpText(h)}, no good long suit: pass` }));
  return rules;
}

// ---- Advancing: partner overcalled or doubled -----------------------------------------------------

function advances(p: Position, pa: ReadCall): CallRule[] {
  const t = theirSuit(p);
  const rho = rhoCall(p);
  const free = rho?.call.kind !== "pass";
  const rules: CallRule[] = [];
  const name = pa.rule?.name;

  if (pa.call.kind === "double" && name === "Takeout double" && t) {
    const unbid = SUITS.filter((x) => x !== t);
    const best = (h: HandFacts): Suit =>
      unbid.slice().sort((a, b) => (isMajor(b) && h.len[b] >= 4 ? 1 : 0) - (isMajor(a) && h.len[a] >= 4 ? 1 : 0) || h.len[b] - h.len[a])[0]!;
    if (!free) {
      const cue = cheapBid(p, t);
      if (cue) rules.push(rule(cue, "Cuebid: 12+ points, forcing. Asks partner to describe their hand further.", (h) => h.hcp >= 12, { name: "Cuebid", shows: { hcp: [12, 37] }, forcing: "one round", why: (h) => `${hcpText(h)}: game is likely; find the best one` }));
      for (const m of unbid.filter(isMajor)) {
        const g = bid(4, m);
        rules.push(rule(g, `Game: 5+ ${SYMBOL[m]} and 10+ points.`, (h) => h.len[m] >= 5 && h.hcp >= 10 && best(h) === m, { why: (h) => `${h.len[m]} ${SUIT_WORDS[m]} and ${hcpText(h)} opposite a takeout double` }));
      }
      rules.push(
        rule(bid(3, "NT"), `13+ HCP, ${SYMBOL[t]} well stopped.`, (h) => h.hcp >= 13 && stopper(h, t) && h.semiBalanced, { why: (h) => `${hcpText(h)} and ${holding(h, t)}` }),
        rule(PASS, `Converts to penalties: long, strong ${SYMBOL[t]}.`, (h) => h.len[t] >= 5 && topHonours(h, t) >= 2 && lastBid(p)!.call.level <= 2, { name: "Penalty pass", why: (h) => `${holding(h, t)}: defend their contract doubled` }),
      );
      for (const x of unbid) {
        const b = cheapBid(p, x);
        if (!b) continue;
        rules.push(rule(bid(b.level + 1, x), `Jump: 9–11 points and 4+ ${SYMBOL[x]}. Invites game.`, (h) => h.hcp >= 9 && h.hcp <= 11 && h.len[x] >= 4 && best(h) === x && b.level + 1 <= 3, { shows: { hcp: [9, 11], len: len(x, 4) }, why: (h) => `${hcpText(h)} and ${h.len[x]} ${SUIT_WORDS[x]}: more than a minimum reply` }));
      }
      rules.push(
        rule(bid(cheapest(p, "NT"), "NT"), `6–10 HCP, ${SYMBOL[t]} stopped, no 4-card major.`, (h) => h.hcp >= 6 && h.hcp <= 10 && stopper(h, t) && unbid.filter(isMajor).every((m) => h.len[m] < 4) && cheapest(p, "NT") <= 2, { shows: { hcp: [6, 10] }, why: (h) => `${hcpText(h)} and ${holding(h, t)}` }),
      );
      for (const x of unbid) {
        const b = cheapBid(p, x);
        if (!b) continue;
        rules.push(rule(b, `Answers the double: 4+ ${SYMBOL[x]} (or the best suit available), 0–8 points.`, (h) => best(h) === x, { shows: { len: len(x, 3) }, why: (h) => `partner asked me to bid: ${h.len[x]} ${SUIT_WORDS[x]} is my best suit` }));
      }
      return rules;
    }
  }

  // Partner showed two suits (Michaels, the unusual 2NT): choose between them. A double by the next
  // player doesn't change that (partner still wants a choice); a bid by them means we only bid with
  // a fit, since partner can bid again.
  if (isBid(pa.call) && (name === "Michaels" || name === "Unusual 2NT") && t) {
    const shownSuits = SUITS.filter((x) => (partnerShown(p).len[x][0] ?? 0) >= 5);
    const overBid = rho?.call.kind === "bid";
    const enough = (h: HandFacts, x: Suit) => !overBid || h.len[x] >= 3;
    if (name === "Michaels" && isMajor(t)) {
      const other: Suit = t === "H" ? "S" : "H";
      return [
        rule(bid(4, other), `Game in partner's ${SYMBOL[other]}.`, (h) => h.len[other] >= 3 && supportPoints(h, other) >= 11, { why: (h) => `${h.len[other]} ${SUIT_WORDS[other]} and ${supportPoints(h, other)} points` }),
        rule(bid(cheapest(p, other), other), `Prefers partner's ${SYMBOL[other]}.`, (h) => h.len[other] >= 3, { why: (h) => `${h.len[other]} ${SUIT_WORDS[other]}: the known fit` }),
        rule(bid(2, "NT"), "Asks which minor partner holds.", () => cheapest(p, "NT") === 2 && !overBid, { name: "Michaels ask", forcing: "one round", why: () => "no fit for the major: find the minor" }),
        rule(PASS, "No fit to show over their bid.", () => true, { why: (h) => `only ${h.len[other]} ${SUIT_WORDS[other]}: let partner decide` }),
      ];
    }
    const choices = shownSuits.length ? shownSuits : SUITS.filter((x) => x !== t && !isMajor(x));
    const better = (h: HandFacts) => choices.slice().sort((a, b) => h.len[b] - h.len[a])[0]!;
    return [
      ...choices.filter(isMajor).map((m) => rule(bid(4, m), `Game in partner's ${SYMBOL[m]}.`, (h) => better(h) === m && h.len[m] >= 3 && supportPoints(h, m) >= 11, { why: (h: HandFacts) => `${h.len[m]} ${SUIT_WORDS[m]} and ${supportPoints(h, m)} points` })),
      ...choices.map((x) =>
        rule(bid(cheapest(p, x), x), `Chooses partner's ${SYMBOL[x]}.`, (h) => better(h) === x && enough(h, x), {
          why: (h: HandFacts) => `${h.len[x]} ${SUIT_WORDS[x]}: the better of partner's ${choices.map((y) => SUIT_WORDS[y]).join(" and ")}`,
        }),
      ),
      rule(PASS, "No fit to show over their bid.", () => true, { why: () => "no fit worth bidding at this level: let partner decide" }),
    ];
  }

  // Partner's natural overcall in a suit (not a conventional bid such as Michaels).
  if (isBid(pa.call) && pa.call.strain !== "NT" && isNatural(pa)) {
    const x = pa.call.strain as Suit;
    const sp = (h: HandFacts) => supportPoints(h, x);
    const raise = cheapBid(p, x);
    if (t && raise) {
      const cue = cheapBid(p, t);
      if (cue && cue.level <= raise.level + 1 && cue.level <= 3) {
        rules.push(rule(cue, `Cuebid: support for ${SYMBOL[x]} (3+) and 10+ points: a limit raise or better.`, (h) => h.len[x] >= 3 && sp(h) >= 10, { name: "Cuebid raise", shows: { hcp: [10, 37], len: len(x, 3) }, forcing: "one round", why: (h) => `${h.len[x]} ${SUIT_WORDS[x]} and ${sp(h)} points` }));
      }
      if (raise.level + 1 <= 4) {
        rules.push(rule(bid(raise.level + 1, x), `Jump raise: 4+ ${SYMBOL[x]}, weak. Blocks the opponents.`, (h) => h.len[x] >= 4 && sp(h) < 10 && h.hcp <= 8, { shows: { hcp: [0, 8], len: len(x, 4) }, why: (h) => `${h.len[x]} ${SUIT_WORDS[x]} but few points: raise high to get in the way` }));
      }
      rules.push(rule(raise, `Raises: 3+ ${SYMBOL[x]}, 6–9 points.`, (h) => h.len[x] >= 3 && sp(h) >= 6, { shows: { hcp: [5, 9], len: len(x, 3) }, why: (h) => `${h.len[x]} ${SUIT_WORDS[x]}: support partner` }));
      const nt = cheapBid(p, "NT");
      if (nt && nt.level <= 3) {
        const r: [number, number] = nt.level === 1 ? [8, 11] : nt.level === 2 ? [12, 14] : [15, 19];
        rules.push(rule(nt, `${r[0]}–${r[1]} HCP with a ${SYMBOL[t]} stopper.`, (h) => stopper(h, t) && h.hcp >= r[0] && h.semiBalanced, { shows: { hcp: r }, why: (h) => `${hcpText(h)} and ${holding(h, t)}` }));
      }
      for (const y of SUITS.filter((y) => y !== x && y !== t)) {
        const b = cheapBid(p, y);
        if (!b || b.level > 3) continue;
        rules.push(rule(b, `New suit: 5+ ${SYMBOL[y]}, 8+ points. Not forcing.`, (h) => h.len[y] >= 5 && goodSuit(h, y) && h.hcp >= 8 && h.len[x] < 3, { shows: { hcp: [8, 37], len: len(y, 5) }, why: (h) => `${holding(h, y)} and no fit for partner` }));
      }
    }
  }
  rules.push(rule(PASS, "Nothing more to say.", () => true, { why: (h) => `${hcpText(h)}: pass` }));
  return rules;
}

/** Michaels over a major, then partner asked 2NT: show the minor. */
function michaelsMinor(): CallRule[] {
  return [
    rule(bid(3, "D"), "Shows the minor: diamonds.", (h) => h.len.D >= 5 && h.len.D >= h.len.C, { shows: { len: len("D", 5) }, why: () => "five or more diamonds" }),
    rule(bid(3, "C"), "Shows the minor: clubs.", () => true, { shows: { len: len("C", 5) }, why: () => "five or more clubs" }),
  ];
}

// ---- They overcalled or doubled our opening -----------------------------------------------------

function responderInCompetition(p: Position, o: Suit): CallRule[] {
  const rho = rhoCall(p)!;
  const rules: CallRule[] = [];
  const sp = (h: HandFacts) => supportPoints(h, o);
  const fitLen = isMajor(o) ? 3 : 4;
  const raise = cheapBid(p, o);

  if (rho.call.kind === "double") {
    rules.push(
      rule({ kind: "redouble" }, "Redouble: 10+ HCP, usually no fit. Says we have the balance of strength.", (h) => h.hcp >= 10 && h.len[o] < fitLen, { shows: { hcp: [10, 37] }, why: (h) => `${hcpText(h)}: our hand` }),
      rule(bid(2, "NT"), `Jordan 2NT: 4+ ${SYMBOL[o]}, 10+ points. A limit raise or better.`, (h) => h.len[o] >= 4 && sp(h) >= 10, { name: "Jordan 2NT", shows: { hcp: [10, 37], len: len(o, 4) }, forcing: "one round", why: (h) => `${h.len[o]} ${SUIT_WORDS[o]} and ${sp(h)} points` }),
      rule(bid(3, o), `Weak jump raise: 4+ ${SYMBOL[o]}, few points. Blocks the opponents.`, (h) => h.len[o] >= 4 && sp(h) < 10, { shows: { hcp: [0, 8], len: len(o, 4) }, why: (h) => `${h.len[o]} ${SUIT_WORDS[o]} and ${sp(h)} points: raise high` }),
      rule(bid(2, o), `Raises: ${cards(fitLen, o)}, 6–9 points.`, (h) => h.len[o] >= fitLen && sp(h) >= 6 && sp(h) <= 9, { shows: { hcp: [6, 9], len: len(o, fitLen) }, why: (h) => `${h.len[o]} ${SUIT_WORDS[o]}: support` }),
    );
    for (const x of SUITS.filter((x) => x !== o && cheapest(p, x) === 1)) {
      rules.push(rule(bid(1, x), `New suit: 4+ ${SYMBOL[x]}, 6+ points. Forcing.`, (h) => h.len[x] >= 4 && h.hcp >= 6, { shows: { hcp: [6, 37], len: len(x, 4) }, forcing: "one round", why: (h) => `${h.len[x]} ${SUIT_WORDS[x]}` }));
    }
    rules.push(
      rule(bid(1, "NT"), "6–9 HCP, balanced.", (h) => h.hcp >= 6 && h.hcp <= 9 && cheapest(p, "NT") === 1, { shows: { hcp: [6, 9] }, why: (h) => `${hcpText(h)}` }),
      rule(PASS, "Weak: nothing to say yet.", () => true, { why: (h) => `${hcpText(h)}` }),
    );
    return rules;
  }

  if (!isBid(rho.call) || rho.call.strain === "NT") return contested(p);
  const t = rho.call.strain as Suit;
  const level = rho.call.level;
  const limit = Number(p.s.negativeDoublesThrough[0]);
  const throughOk = level < limit || (level === limit && SUITS.indexOf(t) >= SUITS.indexOf(p.s.negativeDoublesThrough[1] as Suit));
  const unbid = SUITS.filter((x) => x !== o && x !== t);
  const unbidMajors = unbid.filter(isMajor);

  const cue = cheapBid(p, t);
  if (cue && raise && cue.level <= 3) {
    rules.push(rule(cue, `Cuebid: ${cards(fitLen, o)} and 10+ points. A limit raise or better.`, (h) => h.len[o] >= fitLen && sp(h) >= 10, { name: "Cuebid raise", shows: { hcp: [10, 37], len: len(o, fitLen) }, forcing: "one round", why: (h) => `${h.len[o]} ${SUIT_WORDS[o]} and ${sp(h)} points` }));
    rules.push(rule(bid(raise.level + 1, o), `Jump raise: 4+ ${SYMBOL[o]}, weak. Blocks the opponents.`, (h) => h.len[o] >= 4 && sp(h) < 10, { shows: { hcp: [0, 9], len: len(o, 4) }, why: (h) => `${h.len[o]} ${SUIT_WORDS[o]} but few points: raise high` }));
    rules.push(rule(raise, `Raises: ${cards(fitLen, o)}, 6–10 points.`, (h) => h.len[o] >= fitLen && sp(h) >= 6 && sp(h) <= 10, { shows: { hcp: [6, 10], len: len(o, fitLen) }, why: (h) => `${h.len[o]} ${SUIT_WORDS[o]}: support straight away` }));
  }
  if (throughOk) {
    const negative = (h: HandFacts) => {
      if (h.hcp < (level === 1 ? 6 : 8)) return false;
      if (unbidMajors.length === 2) return unbidMajors.every((m) => h.len[m] >= 4);
      if (unbidMajors.length === 1) return h.len[unbidMajors[0]!] === 4 || (h.len[unbidMajors[0]!] >= 5 && cheapest(p, unbidMajors[0]!) >= 2 && h.hcp < 11);
      return unbid.every((x) => h.len[x] >= 4) || (unbid.some((x) => h.len[x] >= 4) && h.hcp >= 10);
    };
    rules.push(
      rule(DOUBLE, `Negative double: ${level === 1 ? 6 : 8}+ points and the unbid ${unbidMajors.length ? `major${unbidMajors.length > 1 ? "s" : ""} (4 cards)` : "suits"}. Not for penalties.`, negative, {
        name: "Negative double",
        shows: { hcp: [level === 1 ? 6 : 8, 37], len: Object.fromEntries((unbidMajors.length ? unbidMajors : unbid).map((m) => [m, [unbidMajors.length === 2 || !unbidMajors.length ? 4 : 4, 13]])) },
        forcing: "one round",
        why: (h) => `${hcpText(h)} and ${(unbidMajors.length ? unbidMajors : unbid).map((m) => `${h.len[m]} ${SUIT_WORDS[m]}`).join(" and ")}`,
      }),
    );
  }
  for (const x of unbid) {
    const b = cheapBid(p, x);
    if (!b || b.level > 2) continue;
    const need = b.level === 1 ? { hcp: 6, len: 4 } : { hcp: 11, len: 5 };
    rules.push(rule(b, `New suit: ${cards(need.len, x)}, ${need.hcp}+ points. Forcing.`, (h) => h.len[x] >= need.len && h.hcp >= need.hcp, { shows: { hcp: [need.hcp, 37], len: len(x, need.len) }, forcing: "one round", why: (h) => `${h.len[x]} ${SUIT_WORDS[x]} and ${hcpText(h)}` }));
  }
  const nt = cheapBid(p, "NT");
  if (nt && nt.level <= 3) {
    const range = nt.level === 1 ? [8, 10] : nt.level === 2 ? [11, 12] : [13, 15];
    rules.push(rule(nt, `${range[0]}–${range[1]} HCP with a ${SYMBOL[t]} stopper.`, (h) => stopper(h, t) && h.hcp >= range[0]! && h.hcp <= range[1]! && h.semiBalanced, { shows: { hcp: range as [number, number] }, why: (h) => `${hcpText(h)} and ${holding(h, t)}` }));
  }
  rules.push(rule(PASS, "Nothing suitable to bid.", () => true, { why: (h) => `${hcpText(h)}: pass for now` }));
  return rules;
}

function afterNegativeDouble(p: Position, opened: Bid): CallRule[] {
  const o = opened.strain as Suit;
  const t = theirSuit(p);
  const rules: CallRule[] = [];
  for (const m of SUITS.filter((x) => isMajor(x) && x !== o && x !== t)) {
    const b = cheapBid(p, m);
    if (!b) continue;
    rules.push(rule(bid(b.level + 1, m), `4+ ${SYMBOL[m]} and 15+ points.`, (h) => h.len[m] >= 4 && h.points >= 15 && b.level + 1 <= 3, { shows: { hcp: [15, 21], len: len(m, 4) }, why: (h) => `${h.len[m]} ${SUIT_WORDS[m]} and ${h.points} points` }));
    rules.push(rule(b, `4+ ${SYMBOL[m]}, minimum.`, (h) => h.len[m] >= 4, { shows: { len: len(m, 4) }, why: (h) => `${h.len[m]} ${SUIT_WORDS[m]}: the suit partner's double asked about` }));
  }
  const own = cheapBid(p, o);
  if (own) rules.push(rule(own, `6+ ${SYMBOL[o]}.`, (h) => h.len[o] >= 6, { shows: { len: len(o, 6) }, why: (h) => `${h.len[o]} ${SUIT_WORDS[o]}` }));
  const nt = cheapBid(p, "NT");
  if (nt && t && nt.level <= 2) rules.push(rule(nt, `${SYMBOL[t]} stopped, balanced.`, (h) => stopper(h, t) && h.semiBalanced, { why: (h) => `${holding(h, t)} stops their suit` }));
  for (const x of SUITS.filter((x) => x !== o && x !== t)) {
    const b = cheapBid(p, x);
    if (b && b.level <= 2) rules.push(rule(b, `4+ ${SYMBOL[x]}.`, (h) => h.len[x] >= 4, { shows: { len: len(x, 4) }, why: (h) => `${h.len[x]} ${SUIT_WORDS[x]}` }));
  }
  if (own) rules.push(rule(own, `Rebids ${SYMBOL[o]}: nothing else to say.`, () => true, { why: () => "nothing better to bid" }));
  return rules;
}

// ---- Contested part scores: the hard calls -------------------------------------------------------

/**
 * The opponents have outbid us, or are competing over our fit, and nobody is forced: pass,
 * compete one more, or double? The rules of thumb here (the Law of Total Tricks, the balance of
 * points) are exactly the decisions double-dummy simulation will make later, so each is a hard call.
 */
function contested(p: Position): CallRule[] {
  const lb = lastBid(p);
  if (!lb || isOurs(p, lb.seat)) return [];
  const ps = partnerShown(p);
  const ourSuits = SUITS.filter((x) => ps.len[x][0] >= 3);
  if (ourActions(p).length === 0 || ourSuits.length === 0) return [];
  const fit = (h: HandFacts) => ourSuits.filter((x) => h.len[x] + ps.len[x][0] >= 8).sort((a, b) => h.len[b] + ps.len[b][0] - (h.len[a] + ps.len[a][0]))[0] ?? null;
  const t = lb.call.strain;
  const rules: CallRule[] = [];
  for (const x of ourSuits) {
    const b = cheapBid(p, x);
    if (!b || b.level > 4) continue;
    const trumps = (h: HandFacts) => h.len[x] + ps.len[x][0];
    rules.push(
      rule(b, `Competes in ${SYMBOL[x]}: enough trumps between us to go this high.`, (h) => fit(h) === x && trumps(h) - 6 >= b.level, {
        name: "Competing",
        hard: { candidates: [PASS, b, DOUBLE], rule: "Law of Total Tricks: with N trumps between us, compete to the N−6 level" },
        why: (h) => `${trumps(h)} trumps between us (${h.len[x]} here, ${ps.len[x][0]}+ with partner): safe to bid to the ${trumps(h) - 6} level`,
      }),
    );
  }
  rules.push(
    rule(DOUBLE, "Penalty double: we have the balance of points and they've bid too high.", (h) => lb.call.level >= 3 && h.hcp + ps.hcp[0] >= 23 && (t === "NT" || h.len[t as Suit] >= 3), {
      name: "Penalty double",
      hard: { candidates: [PASS, DOUBLE], rule: "double when we hold most of the points and they're at the three level or higher" },
      why: (h) => `${hcpText(h)} + partner's ${ps.hcp[0]}+ is most of the deck, and they're at the ${lb.call.level} level`,
    }),
    rule(PASS, "Lets them play it: not enough trumps or points to compete further.", (h) => {
      const f = fit(h);
      const close = f ? h.len[f] + ps.len[f][0] - 6 === cheapest(p, f) - 1 : false;
      return close || (lb.call.level >= 3 && h.hcp + ps.hcp[0] >= 20);
    }, {
      name: "Competing",
      hard: { candidates: [PASS, DOUBLE], rule: "pass when we lack the trumps to compete and the points to double" },
      why: (h) => {
        const f = fit(h);
        return f ? `${h.len[f] + ps.len[f][0]} trumps between us: not enough to go to the ${cheapest(p, f)} level` : "no clear fit to compete in";
      },
    }),
    rule(PASS, "Lets them play it.", () => true, { why: (h) => `${hcpText(h)}: no reason to bid on` }),
  );
  return rules;
}

export { callName };

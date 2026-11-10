// Opening bids: the first bid of the auction.

import { type Suit } from "../../types";
import { type HandFacts, goodSuit, holding, isMajor, ruleOf15, ruleOf20, stopper, suitHcp, topHonours } from "../evaluate";
import type { CallRule } from "../model";
import { type Position, PASS, bid, openingSeat } from "../position";
import { SUIT_WORDS, SYMBOL, cards, hcpText, len, rule, shapeText } from "./common";

/** Which suit a one-level opening is in: longest first; five-five, the higher; no five-card major, the longer minor (1♦ with 4-4, 1♣ with 3-3). */
export function openingSuit(h: HandFacts): Suit {
  const { len: n } = h;
  const longest = Math.max(n.S, n.H, n.D, n.C);
  if (longest >= 5) {
    // Longest suit; with two of the same length (five or more), the higher-ranking.
    return (["S", "H", "D", "C"] as Suit[]).find((s) => n[s] === longest)!;
  }
  // No five-card suit: the longer minor (four-four: diamonds; three-three: clubs).
  if (n.D > n.C) return "D";
  if (n.C > n.D) return "C";
  return n.D >= 4 ? "D" : "C";
}

/** The longest suit (the higher of two the same length). */
const longest = (h: HandFacts): Suit => (["S", "H", "D", "C"] as Suit[]).reduce((a, b) => (h.len[b] > h.len[a] ? b : a), "S");

/**
 * Nine playing tricks for a strong 2♣ (ten when the long suit is a minor, since a minor game needs
 * eleven): a hand that's nearly game by itself, however few its HCP.
 */
export const nineTricks = (h: HandFacts) => h.tricks >= (isMajor(longest(h)) ? 9 : 10);

/** A gambling 3NT: a solid minor (AKQ, seven or more cards), no ace or king in the other suits. */
/**
 * A gambling 3NT: a solid minor (AKQ, seven or more cards) and at least one other suit stopped, so
 * 3NT has a chance; not much more outside (5 HCP at most), or it's an ordinary opening.
 */
export const gamblingHand = (h: HandFacts) =>
  (["C", "D"] as Suit[]).some(
    (m) =>
      h.len[m] >= 7 &&
      topHonours(h, m) === 3 &&
      h.hcp - suitHcp(h, m) <= 5 &&
      (["S", "H", "D", "C"] as Suit[]).some((x) => x !== m && stopper(h, x)),
  );

/**
 * A seven-card or longer suit with nothing outside it (no ace or king in another suit): little
 * defence, so a preempt rather than a light one-level opening.
 */
export function preemptShape(h: HandFacts): boolean {
  const s = (["S", "H", "D", "C"] as Suit[]).reduce((a, b) => (h.len[b] > h.len[a] ? b : a), "S");
  return h.len[s] >= 7 && (["S", "H", "D", "C"] as Suit[]).every((x) => x === s || (!h.hand[x].includes("A") && !h.hand[x].includes("K")));
}

/** Strong enough to open one of a suit in this seat? */
export function canOpenOne(p: Position, h: HandFacts): boolean {
  if (h.hcp > 21) return false;
  const seat = openingSeat(p);
  if (seat === 4) return p.s.ruleOf15 ? h.hcp >= 10 && ruleOf15(h) : h.hcp >= 12;
  // A long suit and nothing else: preempt instead of opening light (rule of 20, third seat).
  if (h.hcp < 12 && preemptShape(h)) return false;
  if (h.hcp >= 12 && h.points >= 13) return true;
  if (h.hcp >= 12 && h.balanced) return true;
  if (seat <= 2 && p.s.ruleOf20 && h.hcp >= 10 && ruleOf20(h)) return true;
  if (seat === 3 && p.s.lightThirdSeat && h.hcp >= 10 && goodSuit(h, openingSuit(h)) && h.len[openingSuit(h)] >= 5) return true;
  return false;
}

/** Why this suit: the words for a one-level opening. */
function suitReason(h: HandFacts, s: Suit): string {
  if (h.len[s] >= 5) {
    const tie = (["S", "H", "D", "C"] as Suit[]).filter((x) => x !== s && h.len[x] === h.len[s]);
    return tie.length
      ? `${h.len[s]}-${h.len[s]} in ${SUIT_WORDS[s]} and ${SUIT_WORDS[tie[0]!]}: open the higher-ranking`
      : `open your longest suit, ${h.len[s]} ${SUIT_WORDS[s]}`;
  }
  if (s === "D") return h.len.D === 4 && h.len.C === 4 ? "no five-card major; with 4-4 in the minors, open 1♦" : "no five-card major: open your longer minor";
  return h.len.C === 3 && h.len.D === 3 ? "no five-card major; with 3-3 in the minors, open 1♣" : "no five-card major: open your longer minor";
}

function strengthReason(p: Position, h: HandFacts): string {
  const seat = openingSeat(p);
  if (seat === 4 && p.s.ruleOf15) return `${hcpText(h)} plus ${h.len.S} spades makes ${h.hcp + h.len.S}: rule of 15, worth opening in fourth seat`;
  if (h.hcp >= 12) return hcpText(h);
  if (seat === 3) return `${hcpText(h)} with a good suit: a light third-seat opening`;
  return `${hcpText(h)}, and ${h.hcp} + ${h.shape[0]} + ${h.shape[1]} = ${h.hcp + h.shape[0]! + h.shape[1]!}: rule of 20`;
}

export function openingRules(p: Position): CallRule[] {
  const s = p.s;
  const seat = openingSeat(p);
  const ntMajorOk = (h: HandFacts) => s.oneNtWithFiveCardMajor || (h.len.S < 5 && h.len.H < 5);
  const rules: CallRule[] = [];

  if (s.threeNt === "balanced") {
    rules.push(
      rule(bid(3, "NT"), "25–27 HCP, balanced.", (h) => h.balanced && h.hcp >= 25 && h.hcp <= 27, {
        shows: { hcp: [25, 27], balanced: true },
        why: (h) => `${hcpText(h)} and ${shapeText(h)}: balanced, in the 3NT range`,
      }),
    );
  }
  if (s.threeNt === "gambling") {
    // Before the strong 2♣ and the one-level openings: a solid minor with little else can pass the
    // rule of 20, but it's the gambling 3NT.
    rules.push(
      rule(bid(3, "NT"), "Gambling: a solid seven-card or longer minor (ace, king and queen), with at least one other suit stopped.", gamblingHand, {
        name: "Gambling 3NT",
        shows: { hcp: [9, 14] },
        why: (h) => `${holding(h, h.len.C >= 7 ? "C" : "D")} runs by itself, with a side suit stopped: gamble on 3NT`,
      }),
    );
  }

  if (s.strongTwoClubs) {
    rules.push(
      rule(bid(2, "C"), `Strong and artificial: ${s.twoNtMax + 1}+ HCP, or a hand that can take about nine tricks by itself. Forcing.`, (h) => h.hcp > s.twoNtMax || nineTricks(h), {
        name: "Strong 2♣",
        shows: { hcp: [10, 37] },
        forcing: "one round",
        why: (h) =>
          h.hcp > s.twoNtMax
            ? `${hcpText(h)}: too strong for any other opening`
            : `${h.tricks} playing tricks by itself (${holding(h, longest(h))}): nearly game on your own, whatever the HCP`,
      }),
    );
  }
  rules.push(
    rule(bid(2, "NT"), `${s.twoNtMin}–${s.twoNtMax} HCP, balanced.`, (h) => h.balanced && h.hcp >= s.twoNtMin && h.hcp <= s.twoNtMax, {
      shows: { hcp: [s.twoNtMin, s.twoNtMax], balanced: true },
      why: (h) => `${hcpText(h)} and ${shapeText(h)}: balanced, in the 2NT range`,
    }),
    rule(bid(1, "NT"), `${s.oneNtMin}–${s.oneNtMax} HCP, balanced.`, (h) => h.balanced && h.hcp >= s.oneNtMin && h.hcp <= s.oneNtMax && ntMajorOk(h), {
      shows: { hcp: [s.oneNtMin, s.oneNtMax], balanced: true },
      why: (h) => `${hcpText(h)} and ${shapeText(h)}: balanced, in the 1NT range`,
    }),
  );
  for (const suit of ["S", "H", "D", "C"] as Suit[]) {
    const major = suit === "S" || suit === "H";
    const minLen = major ? 5 : 3;
    rules.push(
      rule(
        bid(1, suit),
        `Opening bid: about 12–21 points, ${cards(minLen, suit)}${suit === "D" ? " (usually 4+)" : suit === "C" ? " (3 only when 3-3 in the minors)" : ""}.`,
        (h) => canOpenOne(p, h) && openingSuit(h) === suit,
        {
          shows: { hcp: [seat === 3 ? 10 : 11, 21], len: len(suit, minLen) },
          forcing: "no",
          why: (h) => `${strengthReason(p, h)}; ${suitReason(h, suit)}`,
        },
      ),
    );
  }
  if (s.weakTwos && seat <= 3) {
    for (const suit of ["S", "H", "D"] as Suit[]) {
      rules.push(
        rule(
          bid(2, suit),
          `Weak two: ${s.weakTwoMin}–${s.weakTwoMax} HCP and a good 6-card ${SUIT_WORDS[suit].slice(0, -1)} suit (two of the top three honours, or three of the top five).`,
          (h) =>
            h.len[suit] === 6 &&
            h.hcp >= s.weakTwoMin &&
            h.hcp <= s.weakTwoMax &&
            goodSuit(h, suit) &&
            // A side four-card major makes a weak two a poor description.
            (["S", "H"] as Suit[]).every((m) => m === suit || h.len[m] < 4),
          {
            name: "Weak two",
            shows: { hcp: [s.weakTwoMin, s.weakTwoMax], len: len(suit, 6, 6) },
            why: (h) => `${hcpText(h)}, too few to open at the one level, and six good ${SUIT_WORDS[suit]} (${holding(h, suit)})`,
          },
        ),
      );
    }
  }
  if (seat <= 3) {
    for (const suit of ["S", "H", "D", "C"] as Suit[]) {
      rules.push(
        rule(bid(3, suit), `Preempt: a good 7-card ${SUIT_WORDS[suit].slice(0, -1)} suit (two of the top three honours, or three of the top five) and fewer than opening values.`, (h) => h.len[suit] === 7 && h.hcp >= 5 && h.hcp <= 10 && goodSuit(h, suit), {
          name: "Preempt",
          shows: { hcp: [5, 10], len: len(suit, 7, 7) },
          why: (h) => `${hcpText(h)} and seven ${SUIT_WORDS[suit]} (${holding(h, suit)}): take away the opponents' room`,
        }),
        rule(bid(4, suit), `Preempt: an 8-card ${SUIT_WORDS[suit].slice(0, -1)} suit and fewer than opening values.`, (h) => h.len[suit] >= 8 && h.hcp >= 5 && h.hcp <= 11, {
          name: "Preempt",
          shows: { hcp: [5, 11], len: len(suit, 8) },
          why: (h) => `${hcpText(h)} and ${h.len[suit]} ${SUIT_WORDS[suit]}: preempt at the four level`,
        }),
      );
    }
  }
  rules.push(
    rule(PASS, seat === 4 ? "Not worth opening in fourth seat: the board is passed out." : "Not enough to open.", () => true, {
      shows: { hcp: [0, seat === 3 ? 11 : 13] },
      why: (h) =>
        seat === 4 && p.s.ruleOf15
          ? `${hcpText(h)} plus ${h.len.S} spades makes ${h.hcp + h.len.S}, short of 15: pass it out`
          : `${hcpText(h)}: not enough to open`,
    }),
  );
  return rules;
}

export { SYMBOL };

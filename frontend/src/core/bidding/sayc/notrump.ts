// Structured auctions, uncontested: after a 1NT or 2NT opening (Stayman, Jacoby transfers,
// invitations, Gerber), after a strong 2♣, and after a weak two or a three-level preempt.
// With the opponents in the auction these give way to the competitive and general rules.

import { type Suit } from "../../types";
import { type HandFacts, goodSuit, holding, stopper, SUIT_WORDS } from "../evaluate";
import type { CallRule } from "../model";
import {
  type Bid,
  type Position,
  PASS,
  bid,
  isBid,
  ourActions,
  partner,
  partnerShown,
  theirActions,
} from "../position";
import { cards, hcpText, len, rule, shapeText, SYMBOL } from "./common";

/** Our side's calls as codes ("1NT", "2C", "P"), when only our side has bid. */
function ourCodes(p: Position): string[] {
  return ourActions(p).map((r) => (isBid(r.call) ? `${r.call.level}${r.call.strain}` : r.call.kind === "double" ? "X" : "XX"));
}

/** A notrump opening's structure: its range and the level its responses start at. */
interface NtBase {
  min: number;
  max: number;
  /** Responses start one level above: 2 after 1NT, 3 after 2NT (and after 2♣–2♦–2NT). */
  level: 2 | 3;
  /** How many of our side's calls the opening took (1, or 3 for 2♣–2♦–2NT). */
  start: number;
  name: string;
}

function ntBase(p: Position, codes: string[]): NtBase | null {
  if (codes[0] === "1NT") return { min: p.s.oneNtMin, max: p.s.oneNtMax, level: 2, start: 1, name: "1NT" };
  if (codes[0] === "2NT") return { min: p.s.twoNtMin, max: p.s.twoNtMax, level: 3, start: 1, name: "2NT" };
  if (codes[0] === "2C" && codes[1] === "2D" && codes[2] === "2NT") return { min: 22, max: 24, level: 3, start: 3, name: "2♣ then 2NT" };
  return null;
}

/** Points the partnership needs for game in notrump, and what I need given partner's range. */
const GAME = 25;
const SLAM = 33;

export function structuredRules(p: Position): CallRule[] {
  if (theirActions(p).length > 0) return [];
  const codes = ourCodes(p);
  const opener = ourActions(p)[0]!;
  const iOpened = opener.seat === p.seat;
  const nt = ntBase(p, codes);
  if (nt) return notrumpRules(p, codes.slice(nt.start), nt, iOpened);
  if (codes[0] === "2C" && p.s.strongTwoClubs) return twoClubRules(p, codes, iOpened);
  const op = opener.call;
  if (isBid(op) && (opener.rule?.name === "Weak two" || opener.rule?.name === "Preempt")) {
    return preemptRules(p, codes, op, iOpened);
  }
  return [];
}

// ---- 1NT and 2NT --------------------------------------------------------------------------------

function notrumpRules(p: Position, after: string[], nt: NtBase, iOpened: boolean): CallRule[] {
  const L = nt.level;
  const s = p.s;
  const rules: CallRule[] = [];
  // What responder needs for game (25 total) and slam (33), against the bottom and top of opener's range.
  // Invite opposite the top of the range; game opposite the bottom (after 2NT there's no room to
  // invite, so game from the invitation point).
  const inviteAt = GAME - nt.max;
  const gameMin = L === 2 ? GAME - nt.min : inviteAt;
  const slamMin = SLAM - nt.max;
  const slamSure = SLAM - nt.min;
  const range = `${nt.min}–${nt.max}`;
  const major4 = (h: HandFacts) => h.len.H === 4 || h.len.S === 4;
  const major5 = (h: HandFacts) => h.len.H >= 5 || h.len.S >= 5;
  const transferSuit = (h: HandFacts): Suit | null => {
    if (!major5(h)) return null;
    if (h.len.H > h.len.S) return "H";
    if (h.len.S > h.len.H) return "S";
    return h.hcp >= gameMin ? "H" : "S";
  };

  // Responder's first call.
  if (after.length === 0 && !iOpened) {
    if (s.jacobyTransfers) {
      rules.push(
        rule(bid(L, "D"), `Jacoby transfer: 5+ ♥, any strength. Opener must bid ${L}♥.`, (h) => transferSuit(h) === "H", {
          name: "Jacoby transfer",
          shows: { len: len("H", 5) },
          forcing: "one round",
          why: (h) => `${h.len.H} hearts: transfer, so the strong ${nt.name} hand becomes declarer`,
        }),
        rule(bid(L, "H"), `Jacoby transfer: 5+ ♠, any strength. Opener must bid ${L}♠.`, (h) => transferSuit(h) === "S", {
          name: "Jacoby transfer",
          shows: { len: len("S", 5) },
          forcing: "one round",
          why: (h) => `${h.len.S} spades: transfer, so the strong ${nt.name} hand becomes declarer`,
        }),
      );
    }
    if (s.stayman) {
      rules.push(
        rule(bid(L, "C"), `Stayman: asks opener for a 4-card major. Usually a 4-card major and ${inviteAt}+ HCP.`, (h) => major4(h) && !major5(h) && h.hcp >= inviteAt && !(h.shape.join("") === "4333"), {
          name: "Stayman",
          shows: { hcp: [inviteAt, 37] },
          forcing: "one round",
          why: (h) => `${hcpText(h)} and a 4-card major: look for a 4-4 fit before settling in notrump`,
        }),
      );
    }
    if (L === 2) {
      rules.push(
        rule(bid(2, "NT"), `Invites 3NT: ${inviteAt}–${gameMin - 1} HCP, no 4-card major.`, (h) => h.hcp >= inviteAt && h.hcp <= gameMin - 1, {
          shows: { hcp: [inviteAt, gameMin - 1] },
          why: (h) => `${hcpText(h)}: game if opener is at the top of the ${range} range`,
        }),
      );
    }
    rules.push(
      rule(bid(3, "NT"), `To play: enough for game (${gameMin}+ HCP), no interest in a major or a slam.`, (h) => h.hcp >= gameMin && h.hcp < slamMin, {
        shows: { hcp: [gameMin, slamMin - 1] },
        why: (h) => `${hcpText(h)} with opener's ${range}: ${h.hcp + nt.min}–${h.hcp + nt.max} together, enough for game, not for slam`,
      }),
      rule(bid(4, "NT"), `Quantitative: invites 6NT with ${slamMin}–${slamSure - 1} HCP. Not Blackwood.`, (h) => h.hcp >= slamMin && h.hcp < slamSure && h.semiBalanced, {
        name: "Quantitative 4NT",
        shows: { hcp: [slamMin, slamSure - 1] },
        why: (h) => `${hcpText(h)}: slam if opener has the top of the range`,
      }),
      rule(bid(6, "NT"), `To play: ${slamSure}+ HCP between us is enough for a small slam.`, (h) => h.hcp >= slamSure, {
        shows: { hcp: [slamSure, 37] },
        why: (h) => `${hcpText(h)} with opener's ${range}: at least ${h.hcp + nt.min} together`,
      }),
      rule(PASS, `Weak: no game even opposite a maximum ${nt.name}.`, (h) => h.hcp < inviteAt, {
        shows: { hcp: [0, inviteAt - 1] },
        why: (h) => `${hcpText(h)}: ${h.hcp + nt.max} at most together, short of the 25 a game needs`,
      }),
    );
    return rules;
  }

  // Opener's answer.
  if (after.length === 1 && iOpened) {
    const r = after[0]!;
    if (r === `${L}C` && s.stayman) {
      return [
        rule(bid(L, "H"), "Answers Stayman: 4+ ♥ (may also hold 4 ♠).", (h) => h.len.H >= 4, { shows: { len: len("H", 4) }, why: (h) => `${h.len.H} hearts: show them first` }),
        rule(bid(L, "S"), "Answers Stayman: 4 ♠, not 4 ♥.", (h) => h.len.S >= 4, { shows: { len: { S: [4, 13], H: [0, 3] } }, why: () => "four spades and no four hearts" }),
        rule(bid(L, "D"), "Answers Stayman: no 4-card major.", () => true, { shows: { len: { S: [0, 3], H: [0, 3] } }, why: () => "no four-card major" }),
      ];
    }
    if ((r === `${L}D` || r === `${L}H`) && s.jacobyTransfers) {
      const m: Suit = r === `${L}D` ? "H" : "S";
      const out: CallRule[] = [];
      if (L === 2) {
        out.push(
          rule(bid(3, m), `Super-accept: 4+ ${SYMBOL[m]} and a maximum ${nt.name}.`, (h) => h.len[m] >= 4 && h.hcp >= nt.max, {
            name: "Super-accept",
            shows: { hcp: [nt.max, nt.max], len: len(m, 4) },
            why: (h) => `${h.len[m]} ${SUIT_WORDS[m]} and ${hcpText(h)}: tell partner about the fit and the maximum`,
          }),
        );
      }
      out.push(
        rule(bid(L, m), `Completes the transfer: ${SYMBOL[m]} as asked, says nothing else.`, () => true, {
          name: "Transfer completed",
          why: () => `partner showed five ${SUIT_WORDS[m]}: bid ${L}${SYMBOL[m]} as asked`,
        }),
      );
      return out;
    }
    if (r === "2NT" && L === 2) {
      return [
        rule(bid(3, "NT"), "Accepts the invitation: top of the 1NT range.", (h) => h.hcp >= nt.max - 1 + (nt.max - nt.min >= 2 ? 0 : 1), { why: (h) => `${hcpText(h)}: the top of the range` }),
        rule(PASS, "Declines the invitation: bottom of the range.", () => true, { why: (h) => `${hcpText(h)}: the bottom of the range` }),
      ];
    }
    if (r === "4NT") {
      return [
        rule(bid(6, "NT"), "Accepts the slam invitation.", (h) => h.hcp >= nt.max - 1 || (h.hcp >= nt.min + 1 && h.points > h.hcp), { why: (h) => `${hcpText(h)}: the top of the range` }),
        rule(PASS, "Declines the slam invitation.", () => true, { why: (h) => `${hcpText(h)}: not enough for slam` }),
      ];
    }
    if (r === "4C" && p.s.gerber) {
      return geberAnswers();
    }
    return [rule(PASS, "Partner has placed the contract.", () => true, { why: () => "partner chose the final contract" })];
  }

  // Responder's second call.
  if (after.length === 2 && !iOpened) {
    const [first, answer] = after as [string, string];
    const partnerHcp = partnerShown(p).hcp;
    if (first === `${L}C` && s.stayman) {
      const shownMajor: Suit | null = answer === `${L}H` ? "H" : answer === `${L}S` ? "S" : null;
      const out: CallRule[] = [];
      if (shownMajor) {
        if (L === 2) {
          out.push(
            rule(bid(4, shownMajor), `Game in the 4-4 ${SUIT_WORDS[shownMajor].slice(0, -1)} fit.`, (h) => h.len[shownMajor] >= 4 && h.hcp >= gameMin, { why: (h) => `four ${SUIT_WORDS[shownMajor]} too, and ${hcpText(h)}: game` }),
            rule(bid(3, shownMajor), `Invites game in the 4-4 ${SUIT_WORDS[shownMajor].slice(0, -1)} fit.`, (h) => h.len[shownMajor] >= 4, { why: (h) => `four ${SUIT_WORDS[shownMajor]} too, and ${hcpText(h)}: invite` }),
          );
        } else {
          out.push(rule(bid(4, shownMajor), `Game in the 4-4 ${SUIT_WORDS[shownMajor].slice(0, -1)} fit.`, (h) => h.len[shownMajor] >= 4, { why: () => `four ${SUIT_WORDS[shownMajor]} too: game` }));
        }
      }
      if (L === 2) {
        out.push(
          rule(bid(3, "NT"), "No major fit: game in notrump.", (h) => h.hcp >= gameMin, { why: (h) => `no fit, ${hcpText(h)}: game in notrump` }),
          rule(bid(2, "NT"), "No major fit: invites 3NT.", () => true, { shows: { hcp: [inviteAt, gameMin - 1] }, why: (h) => `no fit, ${hcpText(h)}: invite` }),
        );
      } else {
        out.push(rule(bid(3, "NT"), "No major fit: game in notrump.", () => true, { why: () => "no fit: game in notrump" }));
      }
      return out;
    }
    const transferred: Suit | null = first === `${L}D` ? "H" : first === `${L}H` ? "S" : null;
    if (transferred && s.jacobyTransfers) {
      const m = transferred;
      const superAccepted = answer === `3${m}` && L === 2;
      if (superAccepted) {
        return [
          rule(bid(4, m), "Game: partner showed four trumps and a maximum.", (h) => h.hcp >= 4 || h.len[m] >= 6, { why: () => "partner's super-accept makes game worth bidding" }),
          rule(PASS, "Stops in three.", () => true, { why: (h) => `${hcpText(h)}: very weak` }),
        ];
      }
      const five = (h: HandFacts) => h.len[m] === 5;
      if (L === 2) {
        return [
          rule(bid(4, m), `Game: 6+ ${SYMBOL[m]} and ${gameMin}+ HCP.`, (h) => !five(h) && h.hcp >= gameMin && h.hcp < slamMin, { shows: { hcp: [gameMin, slamMin - 1], len: len(m, 6) }, why: (h) => `${h.len[m]} ${SUIT_WORDS[m]} and ${hcpText(h)}: game in the 8+ card fit` }),
          rule(bid(3, "NT"), `Choice of games: exactly 5 ${SYMBOL[m]}, ${gameMin}+ HCP. Opener picks 3NT or 4${SYMBOL[m]}.`, (h) => five(h) && h.hcp >= gameMin && h.hcp < slamMin, { shows: { hcp: [gameMin, slamMin - 1], len: len(m, 5, 5) }, why: (h) => `five ${SUIT_WORDS[m]} and ${hcpText(h)}: let opener choose between the games` }),
          rule(bid(3, m), `Invites game: 6+ ${SYMBOL[m]}, ${inviteAt}–${gameMin - 1} HCP.`, (h) => !five(h) && h.hcp >= inviteAt && h.hcp < gameMin, { shows: { hcp: [inviteAt, gameMin - 1], len: len(m, 6) }, why: (h) => `${h.len[m]} ${SUIT_WORDS[m]} and ${hcpText(h)}: invite` }),
          rule(bid(2, "NT"), `Invites game: exactly 5 ${SYMBOL[m]}, ${inviteAt}–${gameMin - 1} HCP.`, (h) => five(h) && h.hcp >= inviteAt && h.hcp < gameMin, { shows: { hcp: [inviteAt, gameMin - 1], len: len(m, 5, 5) }, why: (h) => `five ${SUIT_WORDS[m]} and ${hcpText(h)}: invite, showing exactly five` }),
          rule(PASS, `Weak: stops in 2${SYMBOL[m]}.`, (h) => h.hcp < inviteAt, { shows: { hcp: [0, inviteAt - 1] }, why: (h) => `${hcpText(h)}: 2${SYMBOL[m]} is high enough` }),
        ];
      }
      return [
        rule(bid(4, m), `Game: 6+ ${SYMBOL[m]}.`, (h) => !five(h) && h.hcp >= gameMin, { why: () => "game in the 8+ card fit" }),
        rule(bid(3, "NT"), `Choice of games: exactly 5 ${SYMBOL[m]}.`, (h) => h.hcp >= gameMin, { why: () => "let opener choose between the games" }),
        rule(PASS, `Weak: stops in 3${SYMBOL[m]}.`, () => true, { why: (h) => `${hcpText(h)}: no game` }),
      ];
    }
    if (first === "4C" && p.s.gerber) return gerberAsker(p, partnerHcp);
    return [];
  }

  // Opener's second call: answering an invitation or a choice.
  if (after.length === 3 && iOpened) {
    const [first, , third] = after as [string, string, string];
    const top = (h: HandFacts) => h.hcp >= nt.max - (nt.max - nt.min >= 2 ? 1 : 0);
    const transferred: Suit | null = first === `${L}D` ? "H" : first === `${L}H` ? "S" : null;
    if (transferred && L === 2) {
      const m = transferred;
      if (third === "2NT") {
        return [
          rule(bid(4, m), "Accepts, with 3+ trumps.", (h) => top(h) && h.len[m] >= 3, { why: (h) => `top of the range and ${h.len[m]} ${SUIT_WORDS[m]}` }),
          rule(bid(3, "NT"), "Accepts, with only two trumps.", (h) => top(h), { why: () => "top of the range, only two trumps" }),
          rule(bid(3, m), "Declines, with 3+ trumps.", (h) => h.len[m] >= 3, { why: () => "bottom of the range, but a fit: play in the suit" }),
          rule(PASS, "Declines, with two trumps.", () => true, { why: () => "bottom of the range, no fit" }),
        ];
      }
      if (third === `3${m}`) {
        return [
          rule(bid(4, m), "Accepts the invitation.", (h) => top(h) || h.len[m] >= 4, { why: () => "top of the range, or a good fit" }),
          rule(PASS, "Declines the invitation.", () => true, { why: () => "bottom of the range" }),
        ];
      }
      if (third === "3NT") {
        return [
          rule(bid(4, m), `Chooses 4${SYMBOL[m]}: 3+ trumps.`, (h) => h.len[m] >= 3, { why: (h) => `${h.len[m]} ${SUIT_WORDS[m]}: the 5-3 fit` }),
          rule(PASS, "Chooses 3NT: only two trumps.", () => true, { why: () => "only two trumps: notrump" }),
        ];
      }
    }
    if (first === `${L}C`) {
      const answered = after[1]!;
      if (third === "3NT" && answered === `${L}H`) {
        // Responder used Stayman, so holds a major; not hearts, so spades.
        return [
          rule(bid(4, "S"), "Partner's Stayman showed a major; not hearts, so spades: 4-4 fit.", (h) => h.len.S >= 4, { why: () => "four spades too" }),
          rule(PASS, "Happy in 3NT.", () => true, { why: () => "no spade fit" }),
        ];
      }
      if (third === "2NT") {
        return [
          rule(bid(4, "S"), "Partner showed four spades; accepts in spades.", (h) => answered === "2H" && h.len.S >= 4 && top(h), { why: () => "four spades and the top of the range" }),
          rule(bid(3, "NT"), "Accepts the invitation.", (h) => top(h), { why: () => "top of the range" }),
          rule(PASS, "Declines the invitation.", () => true, { why: () => "bottom of the range" }),
        ];
      }
      if (/^3[HS]$/.test(third)) {
        const m: Suit = third === "3H" ? "H" : "S";
        return [
          rule(bid(4, m), "Accepts the invitation.", (h) => top(h), { why: () => "top of the range" }),
          rule(PASS, "Declines the invitation.", () => true, { why: () => "bottom of the range" }),
        ];
      }
    }
    return [rule(PASS, "Partner has placed the contract.", () => true, { why: () => "partner chose the final contract" })];
  }
  return [];
}

/** Answers to Gerber (4♣ over 1NT or 2NT): how many aces. */
function geberAnswers(): CallRule[] {
  return [
    rule(bid(4, "D"), "Answers Gerber: no aces, or all four.", (h) => h.aces === 0 || h.aces === 4, { name: "Gerber answer", why: (h) => `${h.aces} aces` }),
    rule(bid(4, "H"), "Answers Gerber: one ace.", (h) => h.aces === 1, { name: "Gerber answer", why: () => "one ace" }),
    rule(bid(4, "S"), "Answers Gerber: two aces.", (h) => h.aces === 2, { name: "Gerber answer", why: () => "two aces" }),
    rule(bid(4, "NT"), "Answers Gerber: three aces.", (h) => h.aces === 3, { name: "Gerber answer", why: () => "three aces" }),
  ];
}

function gerberAsker(p: Position, partnerHcp: [number, number]): CallRule[] {
  const answer = ourActions(p).at(-1)!.call as Bid;
  const shown = { D: [0, 4], H: [1], S: [2], NT: [3] }[answer.strain as "D" | "H" | "S" | "NT"] ?? [0];
  return [
    rule(bid(7, "NT"), "Grand slam: all the aces and plenty to spare.", (h) => shown.some((a) => a + h.aces === 4) && h.hcp + partnerHcp[0] >= 37, { why: () => "no ace missing and 37+ points together" }),
    rule(bid(6, "NT"), "Small slam: at most one ace missing.", (h) => shown.some((a) => a + h.aces >= 3), { why: (h) => `${h.aces} aces here plus partner's: at most one missing` }),
    rule(PASS, "Two aces missing: stop.", () => answer.strain === "NT", { why: () => "two aces missing" }),
    rule(bid(4, "NT"), "Two aces missing: signs off.", () => true, { why: () => "two aces missing: stop in 4NT" }),
  ];
}

// ---- Strong 2♣ ----------------------------------------------------------------------------------

function twoClubRules(_p: Position, codes: string[], iOpened: boolean): CallRule[] {
  if (codes.length === 1 && !iOpened) {
    const positive = (h: HandFacts, s: Suit) => h.hcp >= 8 && h.len[s] >= 5 && goodSuit(h, s);
    return [
      ...(["H", "S"] as Suit[]).map((s) =>
        rule(bid(2, s), `Positive: 8+ HCP and a good 5+ card ${SUIT_WORDS[s].slice(0, -1)} suit. Game forcing.`, (h) => positive(h, s), { shows: { hcp: [8, 37], len: len(s, 5) }, forcing: "game", why: (h) => `${hcpText(h)} and ${holding(h, s)}` }),
      ),
      ...(["C", "D"] as Suit[]).map((s) =>
        rule(bid(3, s), `Positive: 8+ HCP and a good 5+ card ${SUIT_WORDS[s].slice(0, -1)} suit. Game forcing.`, (h) => positive(h, s), { shows: { hcp: [8, 37], len: len(s, 5) }, forcing: "game", why: (h) => `${hcpText(h)} and ${holding(h, s)}` }),
      ),
      rule(bid(2, "NT"), "Positive: 8+ HCP, balanced. Game forcing.", (h) => h.hcp >= 8 && h.balanced, { shows: { hcp: [8, 37], balanced: true }, forcing: "game", why: (h) => `${hcpText(h)}, balanced` }),
      rule(bid(2, "D"), "Waiting: artificial, says nothing about diamonds. Lets opener describe the hand.", () => true, { name: "Waiting 2♦", forcing: "one round", why: (h) => `${hcpText(h)}: no positive response, so wait and hear more` }),
    ];
  }
  if (codes.length === 2 && iOpened && codes[1] === "2D") {
    return [
      // Twelve or thirteen tricks on its own: bid the slam now, there's nothing to ask partner.
      ...(["S", "H", "D", "C"] as Suit[]).flatMap((s) =>
        [7, 6].map((level) =>
          rule(bid(level, s), `${level === 7 ? "Grand" : "Small"} slam: ${level + 6} tricks on its own in ${SYMBOL[s]}.`, (h) => longestOf(h) === s && Math.min(h.tricks, 13) - 6 === level, {
            why: (h) => `${h.tricks} playing tricks by itself (${holding(h, s)}): no need for partner's help`,
          }),
        ),
      ),
      rule(bid(2, "NT"), "22–24 HCP, balanced. Not forcing.", (h) => h.balanced && h.hcp <= 24, { shows: { hcp: [22, 24], balanced: true }, why: (h) => `${hcpText(h)}, balanced` }),
      rule(bid(3, "NT"), "25–27 HCP, balanced.", (h) => h.balanced, { shows: { hcp: [25, 27], balanced: true }, why: (h) => `${hcpText(h)}, balanced` }),
      ...(["S", "H"] as Suit[]).map((s) =>
        rule(bid(2, s), `Natural: 5+ ${SYMBOL[s]}. Forcing to game.`, (h) => longestOf(h) === s, { shows: { len: len(s, 5) }, forcing: "game", why: (h) => `${h.len[s]} ${SUIT_WORDS[s]}, the longest suit` }),
      ),
      ...(["D", "C"] as Suit[]).map((s) =>
        rule(bid(3, s), `Natural: 5+ ${SYMBOL[s]}. Forcing to game.`, (h) => longestOf(h) === s, { shows: { len: len(s, 5) }, forcing: "game", why: (h) => `${h.len[s]} ${SUIT_WORDS[s]}, the longest suit` }),
      ),
    ];
  }
  if (codes.length === 3 && !iOpened && codes[1] === "2D" && /^[23][SHDC]$/.test(codes[2]!)) {
    const s = codes[2]![1] as Suit;
    const level = Number(codes[2]![0]);
    const major = s === "H" || s === "S";
    return [
      rule(bid(major ? 4 : 5, s), `Support, weak: 3+ ${SYMBOL[s]} and little else.`, (h) => h.len[s] >= 3 && h.hcp < 5, { shows: { hcp: [0, 4], len: len(s, 3) }, why: (h) => `${h.len[s]} ${SUIT_WORDS[s]} but only ${hcpText(h)}: go straight to game` }),
      rule(bid(level + 1, s), `Support with some values: 3+ ${SYMBOL[s]}, 5+ HCP. Slam may be on.`, (h) => h.len[s] >= 3, { shows: { hcp: [5, 37], len: len(s, 3) }, forcing: "game", why: (h) => `${h.len[s]} ${SUIT_WORDS[s]} and ${hcpText(h)}` }),
      rule(bid(3, "NT"), "No fit, stoppers and some values.", (h) => h.hcp >= 5 && h.semiBalanced, { why: (h) => `${hcpText(h)}, no fit` }),
    ];
  }
  return [];
}

const longestOf = (h: HandFacts): Suit => (["S", "H", "D", "C"] as Suit[]).reduce((a, b) => (h.len[b] > h.len[a] ? b : a), "S");

// ---- Weak twos and preempts ---------------------------------------------------------------------

function preemptRules(p: Position, codes: string[], op: Bid, iOpened: boolean): CallRule[] {
  const s = op.strain as Suit;
  const major = s === "H" || s === "S";
  const game = major ? 4 : 5;
  if (codes.length === 1 && !iOpened) {
    const weakTwo = op.level === 2;
    const rules: CallRule[] = [
      rule(bid(game, s), `Game: a fit (3+ ${SYMBOL[s]}), either to make or to make it hard for the opponents.`, (h) => h.len[s] >= 3 && (h.hcp >= 16 || (h.len[s] >= 4 && h.hcp <= 10)) && major, {
        why: (h) => (h.hcp >= 16 ? `${hcpText(h)} and ${h.len[s]} ${SUIT_WORDS[s]}: enough for game` : `${h.len[s]} ${SUIT_WORDS[s]} but weak: raise to game to keep the opponents out`),
      }),
    ];
    if (weakTwo) {
      rules.push(
        rule(bid(2, "NT"), "Asks opener about their hand (a feature: an ace or king outside), with game interest. Forcing.", (h) => h.hcp >= 15, { name: "2NT feature ask", forcing: "one round", shows: { hcp: [15, 37] }, why: (h) => `${hcpText(h)}: game is possible, ask for more` }),
        rule(bid(3, s), `Raises to 3: 3+ ${SYMBOL[s]}, weak. Blocks the opponents; not an invitation.`, (h) => h.len[s] >= 3 && h.hcp < 15, { why: (h) => `${h.len[s]} ${SUIT_WORDS[s]} and ${hcpText(h)}: raise to get in the way` }),
      );
    }
    rules.push(
      rule(bid(3, "NT"), "To play: stoppers outside and a source of tricks.", (h) => h.hcp >= 16 && h.semiBalanced && ["S", "H", "D", "C"].filter((x) => x !== s).every((x) => stopper(h, x as Suit)), { why: (h) => `${hcpText(h)} and stoppers in the other suits` }),
      rule(PASS, "No game opposite a preempt.", () => true, { why: (h) => `${hcpText(h)}: game is unlikely opposite a weak hand` }),
    );
    return rules;
  }
  if (codes.length === 2 && iOpened && codes[1] === "2NT" && op.level === 2) {
    const max = (h: HandFacts) => h.hcp >= p.s.weakTwoMax - 2;
    const feature = (h: HandFacts): Suit | null => (["C", "D", "H", "S"] as Suit[]).find((x) => x !== s && (h.hand[x].includes("A") || h.hand[x].includes("K"))) ?? null;
    return [
      ...(["C", "D", "H", "S"] as Suit[])
        .filter((x) => x !== s)
        .map((x) =>
          rule(bid(3, x), `Maximum, with a feature (ace or king) in ${SYMBOL[x]}.`, (h) => max(h) && feature(h) === x, { name: "Feature", why: (h) => `the top of the range and ${holding(h, x)}` }),
        ),
      rule(bid(3, "NT"), "Maximum, a solid suit, no outside feature.", (h) => max(h), { why: () => "the top of the range" }),
      rule(bid(3, s), "Minimum.", () => true, { why: (h) => `${hcpText(h)}: the bottom of the range` }),
    ];
  }
  return [];
}

export { shapeText, cards, partner };

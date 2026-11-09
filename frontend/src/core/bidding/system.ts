// The bidding system's settings: Standard American Yellow Card (SAYC) and the choices its card
// leaves open. The bots bid by these, and the settings page lists them with words for each.
//
// Stage 1: the defaults are fixed. Stage 2 makes them editable (kept on the device and sent with
// the game). `built: false` marks a choice the rules don't act on yet, so the page can say so.

import type { DistributionCount } from "./evaluate";

export type BlackwoodStyle = "plain" | "rkc1430" | "rkc3014";
export type NegativeDoublesThrough = "2S" | "3S" | "4S";

export interface SystemSettings {
  system: "SAYC";
  /** How the long-suit hand counts its shape on top of HCP: length points, or shortness (3/2/1). */
  distribution: DistributionCount;
  /** 1NT opening range (HCP). */
  oneNtMin: number;
  oneNtMax: number;
  /** 2NT opening range (HCP). */
  twoNtMin: number;
  twoNtMax: number;
  /** Open 1NT with a five-card major when the hand is otherwise right. */
  oneNtWithFiveCardMajor: boolean;
  /** Open light in first and second seat by the rule of 20. */
  ruleOf20: boolean;
  /** Open light in third seat (10+ HCP with a good suit). */
  lightThirdSeat: boolean;
  /** Open in fourth seat by the rule of 15. */
  ruleOf15: boolean;
  /** Weak two openings (2♦ 2♥ 2♠): 6-card suit. */
  weakTwos: boolean;
  weakTwoMin: number;
  weakTwoMax: number;
  /** Strong, artificial 2♣ (22+ HCP, or 9 tricks). */
  strongTwoClubs: boolean;
  stayman: boolean;
  jacobyTransfers: boolean;
  /** 2NT over a major opening: game forcing raise with 4+ support. */
  jacoby2Nt: boolean;
  /** Jump to the four level in a short suit as a raise of partner's major. */
  splinters: boolean;
  /** 2♣ or 2♦ raise of a minor as forcing (10+), 3 as weak. */
  invertedMinors: boolean;
  negativeDoublesThrough: NegativeDoublesThrough;
  /** Jump overcalls are weak (6-card suit, 5–10 HCP). */
  weakJumpOvercalls: boolean;
  /** Cuebid of their suit shows a two-suiter (the other major, or a major and a minor). */
  michaels: boolean;
  /** Jump to 2NT over their opening shows both minors (or the two lowest unbid suits). */
  unusualNt: boolean;
  blackwood: BlackwoodStyle;
  /** 4♣ over partner's 1NT or 2NT opening asks for aces. */
  gerber: boolean;
  /** Opener's rebid of 1NT, then 2 of the unbid minor by responder: forcing, asks about the majors. */
  newMinorForcing: boolean;
  /** The fourth suit bid by responder is artificial and forcing. */
  fourthSuitForcing: boolean;
}

export const SAYC_DEFAULTS: SystemSettings = {
  system: "SAYC",
  distribution: "length",
  oneNtMin: 15,
  oneNtMax: 17,
  twoNtMin: 20,
  twoNtMax: 21,
  oneNtWithFiveCardMajor: true,
  ruleOf20: true,
  lightThirdSeat: true,
  ruleOf15: true,
  weakTwos: true,
  weakTwoMin: 5,
  weakTwoMax: 11,
  strongTwoClubs: true,
  stayman: true,
  jacobyTransfers: true,
  jacoby2Nt: true,
  splinters: false,
  invertedMinors: false,
  negativeDoublesThrough: "2S",
  weakJumpOvercalls: true,
  michaels: true,
  unusualNt: true,
  blackwood: "plain",
  gerber: true,
  newMinorForcing: true,
  fourthSuitForcing: true,
};

/** One line on the settings page. */
export interface SettingLine {
  group: string;
  label: string;
  value: string;
  /** Plain words for a learner. */
  help: string;
  /** False when the bots don't act on this choice yet. */
  built: boolean;
}

const yesNo = (b: boolean) => (b ? "Yes" : "No");

/** The settings page's lines, grouped, in the order a convention card lists them. */
export function describeSettings(s: SystemSettings): SettingLine[] {
  return [
    {
      group: "Hand valuation",
      label: "Your own long suit",
      value: s.distribution === "length" ? "Length points" : "Shortness points (3/2/1)",
      help:
        s.distribution === "length"
          ? "HCP plus 1 point for each card over four in a suit. Once partner supports your suit, add 3 for a void, 2 for a singleton, 1 for a doubleton too: they can ruff. (The other way counts only the 3/2/1, from the start.)"
          : "HCP plus 3 for a void, 2 for a singleton, 1 for a doubleton. (The other way: 1 point for each card over four in a suit.)",
      built: true,
    },
    {
      group: "Hand valuation",
      label: "Raising partner's suit",
      value: "Support points (5/3/1)",
      help: "With four trumps, add 5 for a void, 3 for a singleton, 1 for a doubleton (3/2/1 with three trumps): your short suits let declarer ruff.",
      built: true,
    },
    {
      group: "Hand valuation",
      label: "Playing tricks",
      value: "Counted for long suits",
      help: "Tricks the hand takes by itself with its long suit as trumps: in a suit of five or more, its length less its missing top honours (♠KQJ1098 is 5); in a shorter suit, only aces and kings that are sure to win. A strong 2♣ shows 22+ HCP or 9 such tricks.",
      built: true,
    },
    { group: "Notrump openings", label: "1NT opening", value: `${s.oneNtMin}–${s.oneNtMax} HCP`, help: "A balanced hand: 4-3-3-3, 4-4-3-2 or 5-3-3-2.", built: true },
    { group: "Notrump openings", label: "1NT with a five-card major", value: yesNo(s.oneNtWithFiveCardMajor), help: "A balanced hand in range opens 1NT even with five hearts or spades.", built: true },
    { group: "Notrump openings", label: "2NT opening", value: `${s.twoNtMin}–${s.twoNtMax} HCP`, help: "Balanced, too strong for 1NT.", built: true },
    { group: "Notrump openings", label: "Stayman", value: yesNo(s.stayman), help: "2♣ over 1NT (3♣ over 2NT) asks opener for a four-card major.", built: true },
    { group: "Notrump openings", label: "Jacoby transfers", value: yesNo(s.jacobyTransfers), help: "2♦ over 1NT shows five or more hearts and asks opener to bid 2♥; 2♥ does the same for spades.", built: true },
    { group: "Notrump openings", label: "Gerber", value: yesNo(s.gerber), help: "4♣ over partner's 1NT or 2NT asks how many aces they hold.", built: true },

    { group: "Suit openings", label: "Five-card majors", value: "Yes", help: "1♥ and 1♠ promise five or more cards. With no five-card major, open your longer minor (1♦ with 4-4, 1♣ with 3-3).", built: true },
    { group: "Suit openings", label: "Rule of 20", value: yesNo(s.ruleOf20), help: "In first or second seat, open a hand with fewer than 12 HCP when HCP plus the lengths of the two longest suits make 20.", built: true },
    { group: "Suit openings", label: "Light third-seat openings", value: yesNo(s.lightThirdSeat), help: "After two passes, open with 10–11 HCP and a good suit, to suggest a lead and get in the way.", built: true },
    { group: "Suit openings", label: "Rule of 15", value: yesNo(s.ruleOf15), help: "After three passes, open only when HCP plus the number of spades make 15; otherwise pass the board out.", built: true },
    { group: "Suit openings", label: "Strong 2♣", value: yesNo(s.strongTwoClubs), help: "2♣ is artificial: 22+ HCP, or a hand that can take nine tricks. Partner bids 2♦ to wait.", built: true },
    { group: "Suit openings", label: "Weak twos", value: s.weakTwos ? `2♦ 2♥ 2♠, ${s.weakTwoMin}–${s.weakTwoMax} HCP` : "No", help: "A six-card suit with two of the top three or three of the top five honours, and little outside.", built: true },

    { group: "Responses", label: "Jacoby 2NT", value: yesNo(s.jacoby2Nt), help: "2NT over 1♥ or 1♠: four or more trumps and opening values, forcing to game.", built: true },
    { group: "Responses", label: "Limit raises", value: "Yes", help: "1♥–3♥ or 1♠–3♠: four or more trumps and 10–12 points, inviting game.", built: true },
    { group: "Responses", label: "Splinters", value: yesNo(s.splinters), help: "A double jump in a new suit shows a fit for partner's major and a singleton or void in that suit.", built: false },
    { group: "Responses", label: "Inverted minors", value: yesNo(s.invertedMinors), help: "1♦–2♦ would be strong and 1♦–3♦ weak. Off in SAYC: 1♦–2♦ is 6–10 points.", built: false },
    { group: "Responses", label: "New minor forcing", value: yesNo(s.newMinorForcing), help: "After opener rebids 1NT, responder's 2 of the unbid minor asks about the majors.", built: false },
    { group: "Responses", label: "Fourth suit forcing", value: yesNo(s.fourthSuitForcing), help: "Responder bidding the fourth suit is artificial and forcing: it asks opener to describe further.", built: false },

    { group: "Competition", label: "Negative doubles", value: `Through ${s.negativeDoublesThrough.replace("S", "♠")}`, help: "After partner opens and the next player overcalls, a double shows the unbid suits (especially the majors), not a wish to defend.", built: true },
    { group: "Competition", label: "Weak jump overcalls", value: yesNo(s.weakJumpOvercalls), help: "A jump overcall (1♦–2♠) is like a weak two: a six-card suit and few points.", built: true },
    { group: "Competition", label: "Michaels cuebid", value: yesNo(s.michaels), help: "Bidding their suit at the two level: over a minor, both majors; over a major, the other major and a minor.", built: true },
    { group: "Competition", label: "Unusual 2NT", value: yesNo(s.unusualNt), help: "A jump to 2NT over their opening shows five-five in the two lowest unbid suits.", built: true },
    { group: "Competition", label: "Takeout doubles", value: "Yes", help: "Doubling their opening at a low level asks partner to bid: opening values, short in their suit, support for the others.", built: true },

    { group: "Slams", label: "Blackwood", value: { plain: "Plain (aces)", rkc1430: "Roman Key Card 1430", rkc3014: "Roman Key Card 3014" }[s.blackwood], help: "4NT asks partner how many aces they hold: 5♣ none or four, 5♦ one, 5♥ two, 5♠ three.", built: s.blackwood === "plain" },
  ];
}

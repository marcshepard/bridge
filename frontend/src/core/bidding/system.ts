// The bidding system's settings: Standard American Yellow Card (SAYC) and the choices its card
// leaves open. The bots bid by these, the settings page shows and edits them, and the backend checks
// them, all from one list of fields (SETTING_FIELDS).
//
// Your settings are kept on your device and go with you into each game you start or join (fixed
// once the game starts). A side's bots bid by the card of the person on their side; bots with no
// person on their side bid SAYC as it comes (SAYC_DEFAULTS). Fields with `built: false` are on the
// card but the rules don't act on them yet; fields with `editable: false` can't be changed (yet).

export type BlackwoodStyle = "plain" | "rkc1430" | "rkc3014";
export type NegativeDoublesThrough = "2S" | "3S" | "4S";
/** A 3NT opening: balanced 25–27, or gambling (a solid seven-card minor and little else). */
export type ThreeNtOpening = "balanced" | "gambling";
/** After they double our 1NT: our conventions (Stayman, transfers) still on, or everything natural. */
export type NtDoubled = "on" | "off";
/** After they overcall 2♣ over our 1NT: double is Stayman ("stolen bid"), or everything natural. */
export type NtTwoClubs = "stolen" | "natural";
/** From AK, lead the ace or the king. */
export type LeadFromAk = "A" | "K";
/** From a long suit with no sequence: fourth best, or third best from an even number and lowest from an odd. */
export type LengthLeads = "fourth" | "thirdFifth";
/** Standard: a high card encourages (or shows an even number); upside-down: a low card does. */
export type SignalStyle = "standard" | "upsideDown";

export interface SystemSettings {
  system: "SAYC";
  /** 1NT opening range (HCP). */
  oneNtMin: number;
  oneNtMax: number;
  /** 2NT opening range (HCP). A strong 2♣ starts one above it. */
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
  threeNt: ThreeNtOpening;
  ntDoubled: NtDoubled;
  ntTwoClubs: NtTwoClubs;
  leadFromAk: LeadFromAk;
  lengthLeads: LengthLeads;
  attitude: SignalStyle;
  count: SignalStyle;
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
  threeNt: "balanced",
  ntDoubled: "on",
  ntTwoClubs: "natural",
  leadFromAk: "A",
  lengthLeads: "fourth",
  attitude: "standard",
  count: "standard",
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

/** The card each side of the table bids by. */
export interface TableSystems {
  NS: SystemSettings;
  EW: SystemSettings;
}

type BooleanKey = { [K in keyof SystemSettings]: SystemSettings[K] extends boolean ? K : never }[keyof SystemSettings];

interface FieldBase {
  /** Stable id, for the page's controls. */
  id: string;
  group: string;
  label: string;
  /** Plain words for a learner, for the current value. */
  help: (s: SystemSettings) => string;
  /** False when the bots don't act on this yet. */
  built: boolean;
}

/** A yes/no choice. */
export interface ToggleField extends FieldBase {
  kind: "toggle";
  key: BooleanKey;
  editable: boolean;
}

/** One of a few named options. */
export interface ChoiceField extends FieldBase {
  kind: "choice";
  options: { value: string; label: string }[];
  get: (s: SystemSettings) => string;
  set: (s: SystemSettings, value: string) => SystemSettings;
  editable: true;
}

/** Part of the system, not a choice (yet): shown with its value. */
export interface FixedField extends FieldBase {
  kind: "fixed";
  value: (s: SystemSettings) => string;
  editable: false;
}

export type SettingField = ToggleField | ChoiceField | FixedField;

const toggle = (id: BooleanKey, group: string, label: string, help: string, built = true, editable = true): ToggleField => ({
  kind: "toggle",
  id,
  key: id,
  group,
  label,
  help: () => help,
  built,
  editable,
});

const range = (min: number, max: number) => `${min}-${max}`;
const parseRange = (v: string) => v.split("-").map(Number) as [number, number];

/** Every setting, grouped, in the order a convention card lists them. */
export const SETTING_FIELDS: SettingField[] = [
  {
    kind: "choice",
    id: "oneNt",
    group: "Notrump openings",
    label: "1NT opening",
    options: [
      { value: "15-17", label: "15–17 HCP" },
      { value: "16-18", label: "16–18 HCP" },
    ],
    get: (s) => range(s.oneNtMin, s.oneNtMax),
    set: (s, v) => {
      const [min, max] = parseRange(v);
      return { ...s, oneNtMin: min, oneNtMax: max };
    },
    help: () => "A balanced hand; no singletons and at most one doubleton.",
    built: true,
    editable: true,
  },
  toggle("oneNtWithFiveCardMajor", "Notrump openings", "Allow opening 1NT with a 5-card major", ""),
  {
    kind: "choice",
    id: "twoNt",
    group: "Notrump openings",
    label: "2NT opening",
    options: [
      { value: "20-21", label: "20–21 HCP" },
      { value: "20-22", label: "20–22 HCP" },
    ],
    get: (s) => range(s.twoNtMin, s.twoNtMax),
    set: (s, v) => {
      const [min, max] = parseRange(v);
      return { ...s, twoNtMin: min, twoNtMax: max };
    },
    help: () => "",
    built: true,
    editable: true,
  },
  toggle("stayman", "Notrump openings", "Stayman", "2♣ over 1NT (3♣ over 2NT) asks opener for a four-card major."),
  toggle("jacobyTransfers", "Notrump openings", "Jacoby transfers", "2♦ over 1NT shows five or more hearts and asks opener to bid 2♥; 2♥ does the same for spades."),
  toggle("gerber", "Notrump openings", "Gerber", "4♣ over partner's 1NT or 2NT asks how many aces they hold."),
  {
    kind: "choice",
    id: "threeNt",
    group: "Notrump openings",
    label: "3NT opening",
    options: [
      { value: "balanced", label: "25–27 HCP, balanced" },
      { value: "gambling", label: "Gambling" },
    ],
    get: (s) => s.threeNt,
    set: (s, v) => ({ ...s, threeNt: v as ThreeNtOpening }),
    help: (s) =>
      s.threeNt === "gambling"
        ? "A solid seven-card or longer minor (ace, king and queen), with at least one other suit stopped. Partner passes with the other suits stopped, or bids 4♣ or 5♣ for opener to pass or correct to diamonds."
        : "",
    built: true,
    editable: true,
  },
  {
    kind: "choice",
    id: "ntDoubled",
    group: "Interference over our 1NT",
    label: "They double",
    options: [
      { value: "on", label: "Systems on" },
      { value: "off", label: "Systems off" },
    ],
    get: (s) => s.ntDoubled,
    set: (s, v) => ({ ...s, ntDoubled: v as NtDoubled }),
    help: (s) => (s.ntDoubled === "on" ? "Ignore the double: Stayman and transfers work as usual." : "All bids are natural."),
    built: true,
    editable: true,
  },
  {
    kind: "choice",
    id: "ntTwoClubs",
    group: "Interference over our 1NT",
    label: "They overcall 2♣",
    options: [
      { value: "stolen", label: "Double is Stayman" },
      { value: "natural", label: "Systems off" },
    ],
    get: (s) => s.ntTwoClubs,
    set: (s, v) => ({ ...s, ntTwoClubs: v as NtTwoClubs }),
    help: (s) =>
      s.ntTwoClubs === "stolen" ? "Their 2♣ took our Stayman bid, so double does its job; transfers still work." : "All bids are natural.",
    built: true,
    editable: true,
  },
  {
    kind: "fixed",
    id: "ntHigher",
    group: "Interference over our 1NT",
    label: "They overcall 2♦ or higher",
    value: () => "Systems off",
    help: () => "All bids are natural.",
    built: true,
    editable: false,
  },

  {
    kind: "fixed",
    id: "fiveCardMajors",
    group: "Suit openings",
    label: "Five-card majors",
    value: () => "Yes",
    help: () => "1♥ and 1♠ promise five or more cards. With no five-card major, open your longer minor (1♦ with 4-4, 1♣ with 3-3).",
    built: true,
    editable: false,
  },
  toggle("ruleOf20", "Suit openings", "Rule of 20", "In first or second seat, open a hand with fewer than 12 HCP when HCP plus the lengths of the two longest suits make 20."),
  toggle("lightThirdSeat", "Suit openings", "Light third-seat openings", "After two passes, open with 10–11 HCP and a good suit, to suggest a lead and get in the way."),
  toggle("ruleOf15", "Suit openings", "Rule of 15", "After three passes, open only when HCP plus the number of spades make 15; otherwise pass the board out."),
  toggle("strongTwoClubs", "Suit openings", "Strong 2♣", "2♣ is artificial: the strongest hands, or a hand that can take nine tricks. Partner bids 2♦ to wait.", true, false),
  toggle("weakTwos", "Suit openings", "Weak twos", "2♦, 2♥ and 2♠ show a good six-card suit: two of the top three honours, or three of the top five."),
  {
    kind: "choice",
    id: "weakTwoRange",
    group: "Suit openings",
    label: "Weak two range",
    options: [
      { value: "5-11", label: "5–11 HCP" },
      { value: "6-10", label: "6–10 HCP" },
      { value: "5-10", label: "5–10 HCP" },
    ],
    get: (s) => range(s.weakTwoMin, s.weakTwoMax),
    set: (s, v) => {
      const [min, max] = parseRange(v);
      return { ...s, weakTwoMin: min, weakTwoMax: max };
    },
    help: () => "How many HCP a weak two can have.",
    built: true,
    editable: true,
  },

  toggle("jacoby2Nt", "Responses", "Jacoby 2NT", "2NT over 1♥ or 1♠: four or more trumps and opening values, forcing to game."),
  {
    kind: "fixed",
    id: "limitRaises",
    group: "Responses",
    label: "Limit raises",
    value: () => "Yes",
    help: () => "1♥–3♥ or 1♠–3♠: four or more trumps and 10–12 points, inviting game.",
    built: true,
    editable: false,
  },
  toggle("splinters", "Responses", "Splinters", "A double jump in a new suit shows a fit for partner's major and a singleton or void in that suit.", false, false),
  toggle("invertedMinors", "Responses", "Inverted minors", "1♦–2♦ would be strong and 1♦–3♦ weak. Off in SAYC: 1♦–2♦ is 6–10 points.", false, false),
  toggle("newMinorForcing", "Responses", "New minor forcing", "After opener rebids 1NT, responder's 2 of the unbid minor asks about the majors.", false, false),
  toggle("fourthSuitForcing", "Responses", "Fourth suit forcing", "Responder bidding the fourth suit at the two level or higher is artificial and forcing: it asks opener to describe further.", false, false),

  {
    kind: "choice",
    id: "negativeDoubles",
    group: "Competition",
    label: "Negative doubles",
    options: [
      { value: "2S", label: "Through 2♠" },
      { value: "3S", label: "Through 3♠" },
      { value: "4S", label: "Through 4♠" },
    ],
    get: (s) => s.negativeDoublesThrough,
    set: (s, v) => ({ ...s, negativeDoublesThrough: v as NegativeDoublesThrough }),
    help: () => "After partner opens and the next player overcalls up to this level, a double shows the unbid suits (especially the majors), not a wish to defend.",
    built: true,
    editable: true,
  },
  toggle("weakJumpOvercalls", "Competition", "Weak jump overcalls", "A jump overcall (1♦–2♠) is like a weak two: a six-card suit and few points."),
  toggle("michaels", "Competition", "Michaels cuebid", "Bidding their suit at the two level: over a minor, both majors; over a major, the other major and a minor."),
  toggle("unusualNt", "Competition", "Unusual 2NT", "A jump to 2NT over their opening shows five-five in the two lowest unbid suits."),
  {
    kind: "fixed",
    id: "takeoutDoubles",
    group: "Competition",
    label: "Takeout doubles",
    value: () => "Yes",
    help: () => "Doubling their opening at a low level asks partner to bid: opening values, short in their suit, support for the others.",
    built: true,
    editable: false,
  },

  {
    kind: "choice",
    id: "leadFromAk",
    group: "Leads and signals",
    label: "Lead from AK",
    options: [
      { value: "A", label: "Ace" },
      { value: "K", label: "King" },
    ],
    get: (s) => s.leadFromAk,
    set: (s, v) => ({ ...s, leadFromAk: v as LeadFromAk }),
    help: () => "",
    built: true,
    editable: true,
  },
  {
    kind: "fixed",
    id: "sequences",
    group: "Leads and signals",
    label: "Sequences",
    value: () => "Top card",
    help: () => "From KQJ lead the K, from QJ10 the Q; from an interior sequence (KJ10, Q109) the top of the touching cards: J, 10.",
    built: true,
    editable: false,
  },
  {
    kind: "choice",
    id: "lengthLeads",
    group: "Leads and signals",
    label: "Leads from length",
    options: [
      { value: "fourth", label: "Fourth best" },
      { value: "thirdFifth", label: "Third and fifth" },
    ],
    get: (s) => s.lengthLeads,
    set: (s, v) => ({ ...s, lengthLeads: v as LengthLeads }),
    help: (s) =>
      s.lengthLeads === "fourth"
        ? "From a suit of four or more with an honour, the fourth card from the top. From a doubleton, the top card."
        : "From a suit with an honour, the third card from the top with an even number of cards, the lowest with an odd number. From a doubleton, the top card.",
    built: true,
    editable: true,
  },
  {
    kind: "choice",
    id: "attitude",
    group: "Leads and signals",
    label: "Attitude",
    options: [
      { value: "standard", label: "High encourages" },
      { value: "upsideDown", label: "Low encourages" },
    ],
    get: (s) => s.attitude,
    set: (s, v) => ({ ...s, attitude: v as SignalStyle }),
    help: () => "When partner leads a suit, and for your first discard: whether you'd like the suit continued.",
    built: true,
    editable: true,
  },
  {
    kind: "choice",
    id: "count",
    group: "Leads and signals",
    label: "Count",
    options: [
      { value: "standard", label: "High-low: even" },
      { value: "upsideDown", label: "Low-high: even" },
    ],
    get: (s) => s.count,
    set: (s, v) => ({ ...s, count: v as SignalStyle }),
    help: () => "When declarer leads a suit: whether you hold an even or odd number of cards in it.",
    built: true,
    editable: true,
  },
  {
    kind: "fixed",
    id: "blackwood",
    group: "Slams",
    label: "Blackwood",
    value: () => "Plain (aces)",
    help: () => "4NT asks partner how many aces they hold: 5♣ none or four, 5♦ one, 5♥ two, 5♠ three. (Roman Key Card isn't built yet.)",
    built: true,
    editable: false,
  },
];

/** A field's value in words: "Yes", "15–17 HCP", "Through 2♠". */
export function fieldValue(f: SettingField, s: SystemSettings): string {
  if (f.kind === "toggle") return s[f.key] ? "Yes" : "No";
  if (f.kind === "fixed") return f.value(s);
  const v = f.get(s);
  return f.options.find((o) => o.value === v)?.label ?? v;
}

/**
 * Settings from anywhere (a device's storage, a request): SAYC as it comes, plus every editable
 * choice that's one of its allowed values. Anything else is ignored, so stored or sent settings
 * can't make the bots bid something the rules don't know.
 */
export function parseSystemSettings(raw: unknown): SystemSettings {
  let s: SystemSettings = { ...SAYC_DEFAULTS };
  if (!raw || typeof raw !== "object") return s;
  const given = { ...SAYC_DEFAULTS, ...(raw as Partial<SystemSettings>) };
  for (const f of SETTING_FIELDS) {
    if (!f.editable) continue;
    if (f.kind === "toggle") {
      const v = (raw as Record<string, unknown>)[f.key];
      if (typeof v === "boolean") s = { ...s, [f.key]: v };
    } else if (f.kind === "choice") {
      let v: string | null = null;
      try {
        v = f.get(given);
      } catch {
        v = null;
      }
      if (v !== null && f.options.some((o) => o.value === v)) s = f.set(s, v);
    }
  }
  return s;
}

/** Does a card differ from SAYC as it comes? */
export const isDefault = (s: SystemSettings) => SETTING_FIELDS.every((f) => fieldValue(f, s) === fieldValue(f, SAYC_DEFAULTS));

/** One line on the settings page (read-only views and the report). */
export interface SettingLine {
  group: string;
  label: string;
  value: string;
  help: string;
  built: boolean;
}

/** The settings page's lines, grouped, in the order a convention card lists them. */
export function describeSettings(s: SystemSettings): SettingLine[] {
  return SETTING_FIELDS.map((f) => ({ group: f.group, label: f.label, value: fieldValue(f, s), help: f.help(s), built: f.built }));
}

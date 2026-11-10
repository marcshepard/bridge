// Feedback by email: the address, and the bidding feedback email a player sends from a call in the
// bidding review when they disagree with the bot. No backend: it's a mailto: link, so it opens the
// player's own mail app with the email written and they add what they think.
//
// The email is for a person to read (the hands, the auction, the bot's reasoning) and ends with the
// replay line (providers/replayLine.ts), which the dev-only replay card on Home reads back to bid
// the board again against the current bots. Plain text, one line per round of bidding: mail apps
// use proportional fonts, so a table wouldn't line up.

import type { Call } from "../core/auction";
import type { ReviewedCall } from "../core/bidding/bidder";
import { callName } from "../core/bidding/sayc/common";
import { SAYC_DEFAULTS, type SystemSettings, type TableSystems, describeSettings } from "../core/bidding/system";
import { type Seat, type Vulnerability, SEATS, SEAT_NAMES, SUITS, SUIT_SYMBOLS } from "../core/types";
import type { Board } from "../providers/types";
import { formatReplayLine } from "../providers/replayLine";

export const FEEDBACK_EMAIL = "navia.apps@gmail.com";

const VUL_WORDS: Record<Vulnerability, string> = {
  None: "Nobody vulnerable",
  NS: "North–South vulnerable",
  EW: "East–West vulnerable",
  Both: "Both vulnerable",
};

/** "SAYC" or "SAYC with 1NT opening 16–18 HCP, Gerber No". */
export function systemWords(s: SystemSettings): string {
  const standard = describeSettings(SAYC_DEFAULTS);
  const changed = describeSettings(s).filter((line, i) => line.value !== standard[i]!.value);
  return changed.length ? `SAYC with ${changed.map((l) => `${l.label} ${l.value}`).join(", ")}` : "SAYC";
}

const sentence = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) + (/[.!?]$/.test(s) ? "" : ".") : s);

export interface BidFeedback {
  board: Board;
  /** The whole auction. */
  calls: Call[];
  /** The call in question (its index in the auction). */
  index: number;
  /** That call, as the review explained it. */
  review: ReviewedCall;
  /** The call was the player's own (the bot's view is its suggestion), not a bot's. */
  mine: boolean;
  systems: TableSystems;
}

export function bidFeedbackBody({ board, calls, index, review: r, mine, systems }: BidFeedback): string {
  const seat = SEAT_NAMES[r.seat];
  const call = callName(r.call);
  const botCall = callName(r.bot.call);
  const lines: string[] = [];

  if (!mine) lines.push(`I don't think the bot's ${call} as ${seat} was right.`, "I would have bid: ");
  else if (r.agrees) lines.push(`I bid ${call} as ${seat} and the bot agreed. I don't think it was right.`, "I would have bid: ");
  else lines.push(`I bid ${call} as ${seat}. I don't think the bot's suggestion of ${botCall} was right.`);
  lines.push("");

  if (r.bot.fallback) lines.push(`No rule covers this position yet, so the bot ${mine ? "would bid" : "bid"} ${botCall}.`);
  else lines.push(`The bot ${mine ? "would bid" : "bid"} ${botCall}: ${sentence(r.bot.reason)}${r.bot.name ? ` (${r.bot.name})` : ""}`);
  if (r.bot.simulation) {
    lines.push(`A hard call, settled by simulation over ${r.bot.simulation.deals} deals:`);
    for (const x of r.bot.simulation.results) {
      lines.push(`  ${callName(x.call)}: ${Math.round(x.share * 100)}% of the matchpoints, ${x.average >= 0 ? "+" : ""}${Math.round(x.average)} on average`);
    }
  } else if (r.bot.hard) {
    lines.push(`A hard call, chosen from ${r.bot.hard.candidates.map(callName).join(", ")} by a rule of thumb: ${r.bot.hard.rule}`);
  }
  lines.push("");

  lines.push(`Board ${board.number} · Dealer ${SEAT_NAMES[board.dealer]} · ${VUL_WORDS[board.vul]}`);
  lines.push(`Bidding: North–South ${systemWords(systems.NS)}; East–West ${systemWords(systems.EW)}`);
  lines.push("");

  lines.push("Auction:");
  const start = SEATS.indexOf(board.dealer);
  const seatAt = (i: number): Seat => SEATS[(start + i) % 4]!;
  for (let i = 0; i < calls.length; i += 4) {
    const round = calls.slice(i, i + 4).map((c, j) => `${seatAt(i + j)} ${callName(c)}`);
    lines.push(round.join("   ") + (index >= i && index < i + 4 ? `  ← ${SEAT_NAMES[r.seat]}'s ${callName(r.call)}` : ""));
  }
  lines.push("");

  for (const s of SEATS) {
    const hand = board.hands[s];
    lines.push(`${SEAT_NAMES[s].padEnd(6)} ${SUITS.map((suit) => `${SUIT_SYMBOLS[suit]} ${hand[suit] || "—"}`).join("  ")}`);
  }
  lines.push("");

  lines.push(formatReplayLine({ board, calls, reported: index, systems }));
  return lines.join("\n");
}

/** The mailto: link that opens the player's mail app with the bidding feedback email written. */
export function bidFeedbackHref(f: BidFeedback): string {
  const subject = encodeURIComponent("Bridge Replay bidding feedback");
  // Mail links want CRLF line ends.
  const body = encodeURIComponent(bidFeedbackBody(f).replace(/\n/g, "\r\n"));
  return `mailto:${FEEDBACK_EMAIL}?subject=${subject}&body=${body}`;
}

// The bidding review: a finished board's auction, each call tappable for what it means and why it
// was made. For a bot's call, the bot's reason; for yours, whether the bot would have bid the same,
// and if not, what and why. Hard calls and calls no rule covers yet are marked. The explanations
// are worked out from the hands and the auction each time (the rules are repeatable), so nothing
// is stored.
//
// What other people at the table bid is explained (its meaning) but not judged: feedback is only
// for the player it's about.
//
// Hard calls are settled by simulation (double dummy over deals that fit the bidding), run again
// here: it's seeded from the hand and the auction, so it gives the bot's answer at the table. The
// rule of thumb shows until it's done.

import MailOutlineIcon from "@mui/icons-material/MailOutlined";
import { Alert, Box, Button, Chip, Stack, Typography } from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import type { Call } from "../../core/auction";
import { type Decision, type ReviewedCall, decideWithSimulation, reviewAuction } from "../../core/bidding/bidder";
import { doubleDummy } from "../../services";
import { type Shown, rangeWords } from "../../core/bidding/model";
import { callName } from "../../core/bidding/sayc/common";
import type { TableSystems } from "../../core/bidding/system";
import { type Seat, SEATS, SEAT_NAMES, SUITS, SUIT_SYMBOLS } from "../../core/types";
import type { Board } from "../../providers/types";
import { CallText, SuitString } from "../controls/BridgeText";
import { SheetDialog } from "../controls/SheetDialog";
import { bidFeedbackHref } from "../feedback";
import { seatWithRelation } from "../labels";
import { AuctionTable, type CallMark, MarkLegend } from "./Auction";

const sameCall = (a: Call, b: Call) => a.kind === b.kind && (a.kind !== "bid" || (b.kind === "bid" && a.level === b.level && a.strain === b.strain));

interface Props {
  board: Board;
  calls: Call[];
  /** Your seat. */
  seat: Seat;
  names: Record<Seat, string>;
  /** Seats held by bots. */
  bots: Seat[];
  /** The card each side bids by. */
  systems: TableSystems;
  /** Open the bidding system page. */
  onSystem?: () => void;
  /**
   * During the play: what each bid means and what the bidding had shown, nothing more. No marks, no
   * comparisons and no bots' reasons, which would give away the hands nobody can see yet.
   */
  meaningsOnly?: boolean;
}

/**
 * Every call of the auction explained, with the hard calls settled by simulation as each finishes
 * (the rule of thumb shows until then). `simulate: false` leaves the rule of thumb.
 */
export function useReviewedAuction(board: Board, calls: Call[], systems: TableSystems, simulate: boolean) {
  const plain = useMemo(() => reviewAuction(board.hands, { dealer: board.dealer, vul: board.vul }, calls, systems), [board, calls, systems]);
  // Hard calls, settled by simulation (by index), as each finishes.
  const [simulated, setSimulated] = useState<Record<number, Decision>>({});
  const [simulating, setSimulating] = useState(false);
  useEffect(() => {
    setSimulated({});
    const hard = plain.map((r, i) => (r.bot.hard ? i : -1)).filter((i) => i >= 0);
    if (!simulate || !doubleDummy || hard.length === 0) return;
    let cancelled = false;
    setSimulating(true);
    void (async () => {
      for (const i of hard) {
        const r = plain[i]!;
        try {
          const d = await decideWithSimulation(r.position, board.hands[r.seat], doubleDummy);
          if (cancelled) return;
          setSimulated((s) => ({ ...s, [i]: d }));
        } catch {
          // The rule of thumb stands for this call.
        }
      }
      if (!cancelled) setSimulating(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [plain]);
  const review: ReviewedCall[] = plain.map((r, i) => {
    const bot = simulated[i];
    return bot ? { ...r, bot, agrees: sameCall(bot.call, r.call) } : r;
  });
  return { review, simulating };
}

export function BiddingReview({ board, calls, seat, names, bots, systems, onSystem, meaningsOnly = false }: Props) {
  const { review, simulating } = useReviewedAuction(board, calls, systems, !meaningsOnly);
  const [open, setOpen] = useState<number | null>(null);
  const isBot = (s: Seat) => bots.includes(s);
  const mine = (r: ReviewedCall) => r.seat === seat && !isBot(seat);

  const markOf = (i: number): CallMark | null => {
    const r = review[i];
    if (!r || meaningsOnly) return null;
    if (mine(r) && !r.agrees) return "differs";
    if (isBot(r.seat) ? r.bot.fallback : r.read.guessed) return "norule";
    if ((isBot(r.seat) || (mine(r) && r.agrees)) && r.bot.hard) return "hard";
    return null;
  };
  const marks = review.map((_, i) => markOf(i)).filter((m): m is CallMark => !!m);
  const differs = review.filter((r) => mine(r) && !r.agrees).length;

  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        {meaningsOnly ? (
          "Tap a bid to see what it means."
        ) : (
          <>
            Tap a bid to see the{" "}
            {onSystem ? (
              // Opens the bidding system each side bid by: a button that reads as part of the sentence.
              <Button onClick={onSystem} sx={{ p: 0, minWidth: 0, verticalAlign: "baseline", typography: "body2", textTransform: "none" }}>
                bot's evaluation
              </Button>
            ) : (
              "bot's evaluation"
            )}
            .
          </>
        )}
        {!meaningsOnly &&
          review.some(mine) &&
          (differs === 0 ? " The bot agrees with all your bids." : ` The bot would bid ${differs === 1 ? "one of yours" : `${differs} of yours`} differently.`)}
        {simulating && " Working out the hard calls…"}
      </Typography>
      <AuctionTable dealer={board.dealer} vul={board.vul} names={names} calls={calls} seat={seat} onOpenCall={setOpen} marks={markOf} />
      <MarkLegend marks={marks} />
      {open !== null && review[open] && (
        <CallDialog
          r={review[open]}
          me={seat}
          names={names}
          isBot={!meaningsOnly && isBot(review[open].seat)}
          isMine={!meaningsOnly && mine(review[open])}
          feedbackHref={
            // Disagreeing with the bot: its call, or its view of yours. Not while the hands are hidden.
            !meaningsOnly && (isBot(review[open].seat) || mine(review[open]))
              ? bidFeedbackHref({ board, calls, index: open, review: review[open], mine: mine(review[open]), systems })
              : undefined
          }
          onPrev={open > 0 ? () => setOpen(open - 1) : undefined}
          onNext={open < review.length - 1 ? () => setOpen(open + 1) : undefined}
          onClose={() => setOpen(null)}
        />
      )}
    </Box>
  );
}

function CallDialog({
  r,
  me,
  names,
  isBot,
  isMine,
  feedbackHref,
  onPrev,
  onNext,
  onClose,
}: {
  r: ReviewedCall;
  me: Seat;
  names: Record<Seat, string>;
  isBot: boolean;
  isMine: boolean;
  /** The bidding feedback email, when you can disagree with the bot here. */
  feedbackHref?: string;
  onPrev?: () => void;
  onNext?: () => void;
  onClose: () => void;
}) {
  const known = SEATS.filter((s) => describeShown(r.shownBefore[s]));
  const name = r.read.rule?.name;
  return (
    <SheetDialog
      open
      title={
        <>
          {SEAT_NAMES[r.seat]} ({names[r.seat]}): <CallText call={r.call} />
        </>
      }
      onClose={onClose}
      actions={
        <Stack direction="row" spacing={1} sx={{ width: 1 }}>
          <Button variant="outlined" fullWidth disabled={!onPrev} onClick={onPrev}>
            Previous bid
          </Button>
          <Button variant="outlined" fullWidth disabled={!onNext} onClick={onNext}>
            Next bid
          </Button>
        </Stack>
      }
    >
      <Stack spacing={2}>
        <Box>
          <Typography variant="subtitle2" component="h3" color="text.secondary">
            What it means
          </Typography>
          <Typography>
            <SuitString text={r.read.meaning} />
          </Typography>
          {name && !r.read.guessed && <Chip size="small" label={<SuitString text={name} />} sx={{ mt: 0.5 }} />}
        </Box>

        <BotVerdict r={r} isBot={isBot} isMine={isMine} />

        {feedbackHref && (
          <Box>
            <Button variant="outlined" component="a" href={feedbackHref} startIcon={<MailOutlineIcon />}>
              Disagree? Email us
            </Button>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Opens your email with this board and the bidding written out. Add what you'd bid, and why.
            </Typography>
          </Box>
        )}

        {known.length > 0 && (
          <Box>
            <Typography variant="subtitle2" component="h3" color="text.secondary">
              What the bidding had shown before this
            </Typography>
            <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
              {known.map((s) => (
                <li key={s}>
                  <Typography>
                    {seatWithRelation(me, s)}: <SuitString text={describeShown(r.shownBefore[s])!} />
                  </Typography>
                </li>
              ))}
            </Box>
          </Box>
        )}
      </Stack>
    </SheetDialog>
  );
}

/**
 * The bot's side of a call: why it bid it (a bot's call), or whether it would have bid the same (yours),
 * how a hard call was settled, and when no rule covers the position. In the call dialog, and in the
 * dev replay of a reported call.
 */
export function BotVerdict({ r, isBot, isMine }: { r: ReviewedCall; isBot: boolean; isMine: boolean }) {
  return (
    <>
      {isBot && (
        <Box>
          <Typography variant="subtitle2" component="h3" color="text.secondary">
            Why the bot bid it
          </Typography>
          <Typography>
            <SuitString text={sentence(r.bot.reason)} />
          </Typography>
        </Box>
      )}

      {isMine &&
        (r.agrees ? (
          <Alert severity="success">
            The bot would bid the same: <SuitString text={r.bot.reason} />.
          </Alert>
        ) : (
          <Alert severity="warning">
            The bot would have bid <strong>{callName(r.bot.call)}</strong>
            {r.bot.fallback ? "" : <>: <SuitString text={r.bot.reason} /></>}.
            {!r.bot.fallback && (
              <Box component="span" sx={{ display: "block", mt: 0.5 }}>
                {callName(r.bot.call)} means: <SuitString text={r.bot.meaning} />
              </Box>
            )}
          </Alert>
        ))}

      {(isBot || (isMine && r.agrees) || (isMine && r.bot.simulation)) && r.bot.hard && (
        <Alert severity="info">
          {r.bot.simulation ? (
            <>
              A hard call, settled by simulation: {r.bot.simulation.deals} deals that fit the bidding, each candidate scored with
              perfect play (double dummy) and compared at matchpoints.
              <Box component="ul" sx={{ m: 0, mt: 0.5, pl: 2.5 }}>
                {r.bot.simulation.results.map((x) => (
                  <li key={callName(x.call)}>
                    <strong>{callName(x.call)}</strong>: {Math.round(x.share * 100)}% of the matchpoints, {x.average >= 0 ? "+" : ""}
                    {Math.round(x.average)} on average
                  </li>
                ))}
              </Box>
            </>
          ) : (
            <>
              A hard call: the rules don't settle it. The bot chose between {r.bot.hard.candidates.map(callName).join(", ")} by a rule of
              thumb: <SuitString text={r.bot.hard.rule} />.
            </>
          )}
        </Alert>
      )}
      {((isBot && r.bot.fallback) || (!isBot && r.read.guessed)) && (
        <Alert severity="error">
          No rule covers this position yet{isBot ? ", so the bot made the simplest call it could" : ", so it's read as natural"}. Worth
          telling us about.
        </Alert>
      )}
    </>
  );
}

/** "Rule of 20" → "Rule of 20." */
const sentence = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) + (/[.!?]$/.test(s) ? "" : ".") : s);

/** What the auction has shown about a hand, in a line ("12–21 HCP · 5+ ♠ · balanced"), or null if nothing yet. */
function describeShown(s: Shown): string | null {
  const parts: string[] = [];
  if (s.hcp[0] > 0 || s.hcp[1] < 37) parts.push(rangeWords(s.hcp, "HCP"));
  for (const suit of SUITS) {
    const [lo, hi] = s.len[suit];
    if (lo > 0 && hi < 13) parts.push(lo === hi ? `${lo} ${SUIT_SYMBOLS[suit]}` : `${lo}–${hi} ${SUIT_SYMBOLS[suit]}`);
    else if (lo > 0) parts.push(`${lo}+ ${SUIT_SYMBOLS[suit]}`);
    else if (hi < 13) parts.push(`at most ${hi} ${SUIT_SYMBOLS[suit]}`);
  }
  if (s.balanced) parts.push("balanced");
  return parts.length ? parts.join(" · ") : null;
}

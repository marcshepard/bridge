// Bidding a board on the players' devices: the board screen while the auction is going. Each device
// shows the auction so far, a bidding box and its own hand; the calls come from the shared auction
// (the backend checks every call), so all four devices show the same auction. When it ends, the
// contract goes in and the play table takes over; passed out, the board is done.
//
// Bots bid by themselves: the game owner's device makes their calls, by the rules in core/bidding,
// after a short pause so everyone can follow.
// (Players see "bid" for every call, Pass and doubles included; "call" is only the code's word.)

import { Box, Button, Typography } from "@mui/material";
import { useEffect, useMemo, useRef, useState } from "react";
import { type Call, auctionResult, canCall, isAuctionOver, toCall } from "../../core/auction";
import { chooseCall, chooseCallWithSimulation, readAuction } from "../../core/bidding/bidder";
import { sameCall } from "../../core/bidding/position";
import { doubleDummy } from "../../services";
import type { TableSystems } from "../../core/bidding/system";
import { hcp } from "../../core/deal";
import { type Seat, type Strain, STRAINS, SEAT_NAMES } from "../../core/types";
import type { Board } from "../../providers/types";
import { AuctionTable } from "../components/Auction";
import { CallMeaning, useReviewedAuction } from "../components/BiddingReview";
import { HandTiles } from "../components/Hand";
import { CallText, ContractText, StrainSymbol, SuitString, callWords } from "../controls/BridgeText";
import { ChoiceGroup } from "../controls/ChoiceGroup";
import { HelpTip } from "../controls/HelpTip";
import { Section } from "../controls/Layout";
import { TurnStrip } from "../controls/TurnStrip";
import { playerPlace, vulnerableShort } from "../labels";
import { useBotHints } from "../botHints";
import { useConfirmBids } from "../confirmBids";
import { BID_COLOURS } from "../theme";

const STRAIN_WORDS: Record<Strain, string> = { C: "Clubs", D: "Diamonds", H: "Hearts", S: "Spades", NT: "No trumps" };

/** How long a bot takes over its call, so the table can follow the auction. */
const BOT_DELAY_MS = 1200;

interface Props {
  board: Board;
  seat: Seat;
  names: Record<Seat, string>;
  /** Players with no live connection right now: the auction waits for them. */
  away: Record<Seat, boolean>;
  /** Seats held by bots (practice games, dev test players). */
  bots: Seat[];
  /** The seats this device makes the bots' calls for (on the owner's device, the bots' seats). */
  autoSeats: Seat[];
  /** The card each side bids by. */
  systems: TableSystems;
  /** The calls so far, in order. */
  calls: Call[];
  /** Sends a call (`seq` is its number in the auction, from 1); rejects with the reason if it's refused. */
  onCall: (seq: number, call: Call) => Promise<void>;
}

export function BidHand(p: Props) {
  const { board, seat, names, away, calls } = p;
  const dealer = board.dealer;
  const over = isAuctionOver(calls);
  const caller = toCall(dealer, calls);
  // A call this device makes by the bot's rules: a bot's (on the owner's device).
  const auto = !over && p.autoSeats.includes(caller);
  const mine = !over && caller === seat;

  const [level, setLevel] = useState<number | null>(null);
  const [picked, setPicked] = useState<Call | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // On your turn the bidding box appears under your hand: bring it into view if it's below the
  // screen (a phone, a long auction).
  const boxRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (mine) boxRef.current?.scrollIntoView({ block: "nearest" });
  }, [mine]);
  // A new call (anyone's) starts the box afresh.
  useEffect(() => {
    setLevel(null);
    setPicked(null);
    setHint(null);
  }, [calls.length]);

  // The bots' calls: after a pause. If the call is refused (another device got there first, say),
  // the next update starts the timer again.
  // A hard call is decided by simulation (double dummy over deals that fit the auction), worked out
  // during the pause, so the bot takes no longer unless the simulation does.
  useEffect(() => {
    if (!auto) return;
    let cancelled = false;
    const pause = new Promise((resolve) => setTimeout(resolve, BOT_DELAY_MS));
    const decision = chooseCallWithSimulation(board.hands[caller], { dealer, vul: board.vul }, calls, p.systems, doubleDummy).catch(
      // If the solver fails, the rules of thumb still give a call.
      () => chooseCall(board.hands[caller], { dealer, vul: board.vul }, calls, p.systems),
    );
    void Promise.all([decision, pause]).then(([d]) => {
      if (!cancelled) void p.onCall(calls.length + 1, d.call).catch(() => {});
    });
    return () => {
      cancelled = true;
    };
  }, [auto, calls.length, caller]);

  // What the bot would bid with your hand here, worked out as your turn starts (a hard call by the
  // same seeded simulation as the bidding review, so the two agree). Only used to say so when your
  // pick matches: a nudge, not the answer.
  // Only with Bot hints on (the avatar menu).
  const hints = useBotHints();
  const confirm = useConfirmBids();
  const [botCall, setBotCall] = useState<Call | null>(null);
  // The same answer as a promise, for the word after a bid made with one tap (it may still be working).
  const botCallLater = useRef<Promise<Call> | null>(null);
  useEffect(() => {
    setBotCall(null);
    botCallLater.current = null;
    if (!mine || !hints) return;
    let cancelled = false;
    const deal = { dealer, vul: board.vul };
    const later = chooseCallWithSimulation(board.hands[seat], deal, calls, p.systems, doubleDummy)
      .catch(() => chooseCall(board.hands[seat], deal, calls, p.systems))
      .then((d) => d.call);
    botCallLater.current = later;
    void later.then((c) => {
      if (!cancelled) setBotCall(c);
    });
    return () => {
      cancelled = true;
    };
  }, [mine, calls.length, hints]);
  // With Confirm bids off there's no pick to show the hint on, so it comes after the bid: whether
  // the bot would have bid the same, and if not, what. Until your next turn.
  const [after, setAfter] = useState<{ call: Call; bot: Call } | null>(null);
  useEffect(() => {
    if (mine) setAfter(null);
  }, [mine]);

  // The picked bid read as partner would read it: the auction with it added, by your side's card.
  const meaning = useMemo(() => {
    if (!picked) return null;
    const read = readAuction({ dealer, vul: board.vul }, [...calls, picked], p.systems)[calls.length]?.read;
    return read ? { call: picked, read } : null;
  }, [picked, calls, dealer, board.vul, p.systems]);

  // Any call so far, tapped in the auction: what it means by its side's card, as in the review
  // during play. Meanings only, never a bot's reason, which would give its hand away.
  const { review } = useReviewedAuction(board, calls, p.systems, false);
  const [explained, setExplained] = useState<number | null>(null);

  const allowed = (call: Call) => mine && canCall(dealer, calls, call);
  const bidAllowed = (lv: number, strain: Strain) => allowed({ kind: "bid", level: lv, strain });

  async function send(call: Call | null = picked) {
    if (!call) return;
    setHint(null);
    setBusy(true);
    const later = confirm ? null : botCallLater.current;
    try {
      await p.onCall(calls.length + 1, call);
      void later?.then((bot) => setAfter({ call, bot }));
    } catch (e) {
      setHint((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const end = auctionResult(dealer, calls);
  const awayNote = away[caller] && !p.bots.includes(caller) ? " (away)" : "";
  const turn = over
    ? ""
    : caller === seat
      ? "Your turn"
      :`${SEAT_NAMES[caller]}'s turn${p.bots.includes(caller) ? " (bot)" : awayNote}`;
  const vulText = `Vul: ${vulnerableShort(seat, board.vul)}`;

  return (
    <Box component="section" aria-label="Bidding" className="no-select">
      <TurnStrip
        left={
          <Typography variant="h6" component="h1" sx={{ lineHeight: 1.2 }} noWrap>
            Bidding
            <Typography variant="caption" component="span" color="text.secondary" sx={{ display: "block" }} noWrap>
              {SEAT_NAMES[dealer]} dealt
            </Typography>
          </Typography>
        }
        turn={turn}
        mine={mine}
        right={
          // One line where there's room; on the narrowest phones it wraps rather than being cut off.
          <Typography variant="caption" color="text.secondary" component="p" sx={{ lineHeight: 1.3 }}>
            {vulText}
          </Typography>
        }
      />
      {/* Why a bid didn't go, what's happening, or how the auction ended. Always its height. */}
      <Typography variant="subtitle1" noWrap sx={{ mb: 1 }} aria-live="polite" color={hint ? "error" : undefined}>
        {hint ??
          (busy ? (
            "Sending your bid…"
          ) : end ? (
            end.contract && end.declarer ? (
              <>
                The contract is <ContractText contract={end.contract} /> by {SEAT_NAMES[end.declarer]}
              </>
            ) : (
              "Passed out"
            )
          ) : (
            " "
          ))}
      </Typography>

      <AuctionTable
        dealer={dealer}
        vul={board.vul}
        names={names}
        calls={calls}
        seat={seat}
        onOpenCall={(i) => setExplained(explained === i ? null : i)}
        shaded={explained ?? undefined}
      />
      {explained !== null && review[explained] && <CallMeaning r={review[explained]} me={seat} onClose={() => setExplained(null)} />}

      {/* Your hand sits above the bidding box, so it stays put while the box comes and goes below it. */}
      <Section title={`Your hand (${hcp(board.hands[seat])} HCP)`} id="your-hand" tight>
        <HandTiles hand={board.hands[seat]} trump={null} />
      </Section>

      {/*
        The bidding box, under its own heading so it reads as the place you act rather than part of
        the auction above (no panel around it: it took room and the heading does the job). Only on your turn, and with only the bids you can
        make: the rest leave empty places, so every button keeps its place from one turn to the next.
        On someone else's turn, just whose bid it is.
      */}
      {!over && (
        <Box ref={boxRef}>
          {mine ? (
            <Section
              title={
                <>
                  Your bid <BiddingHelp />
                </>
              }
              id="your-bid"
            >
              <Box>
                <ChoiceGroup
                  value={level}
                  disabled={busy}
                  onChange={(lv) => {
                    setLevel(lv);
                    setPicked(picked?.kind === "bid" && bidAllowed(lv, picked.strain) ? { ...picked, level: lv } : null);
                  }}
                  choices={[1, 2, 3, 4, 5, 6, 7].map((lv) => ({
                    value: lv,
                    label: lv,
                    ariaLabel: `Level ${lv}`,
                    hidden: !STRAINS.some((s) => bidAllowed(lv, s)),
                  }))}
                />
                {/* The level and the suit make one bid, so they sit together; Pass, X and XX are a choice of their own. */}
                <ChoiceGroup
                  space="tight"
                  value={picked?.kind === "bid" ? picked.strain : null}
                  disabled={busy || level === null}
                  onChange={(strain) => {
                    if (level === null) return;
                    const call: Call = { kind: "bid", level, strain };
                    setPicked(call);
                    if (!confirm) void send(call);
                  }}
                  choices={STRAINS.map((s) => ({
                    value: s,
                    label: <StrainSymbol strain={s} />,
                    ariaLabel: STRAIN_WORDS[s],
                    hidden: level !== null && !bidAllowed(level, s),
                  }))}
                />
                {/* Pass on the left; on the right X or XX, whichever you can make (never both), or nothing. */}
                <ChoiceGroup<"pass" | "gap" | "double" | "redouble">
                  space="loose"
                  value={picked && picked.kind !== "bid" ? picked.kind : null}
                  disabled={busy}
                  onChange={(kind) => {
                    if (kind === "gap") return;
                    setLevel(null);
                    setPicked({ kind });
                    if (!confirm) void send({ kind });
                  }}
                  choices={[
                    { value: "pass", label: "Pass", color: BID_COLOURS.pass },
                    { value: "gap", label: "", hidden: true },
                    allowed({ kind: "redouble" })
                      ? { value: "redouble", label: "XX", ariaLabel: "Redouble", color: BID_COLOURS.redouble }
                      : { value: "double", label: "X", ariaLabel: "Double", color: BID_COLOURS.double, hidden: !allowed({ kind: "double" }) },
                  ]}
                />
                {/*
                  One tap makes the bid you've put together. It says which ("Submit 3♥", "Submit Pass"),
                  worded unlike the box's own buttons, so it never looks like a second "Pass".
                */}
                {confirm && (
                <Box sx={{ textAlign: "center", mt: 2 }}>
                  <Button
                    variant="contained"
                    size="large"
                    disabled={busy || !picked}
                    aria-label={picked ? `Submit ${callWords(picked)}` : undefined}
                    onClick={() => void send()}
                    sx={{ minWidth: (t) => t.spacing(20) }}
                  >
                    Submit
                    {picked && (
                      <>
                        &nbsp;
                        {picked.kind === "bid" ? <CallText call={picked} /> : callWords(picked)}
                      </>
                    )}
                  </Button>
                </Box>
                )}
                {/* What the picked bid would tell partner, by your side's card: the same reading as the bidding review. */}
                {confirm && meaning && (
                  <Typography variant="body2" sx={{ mt: 1.5 }} aria-live="polite">
                    <strong>{meaning.call.kind === "bid" ? <CallText call={meaning.call} /> : callWords(meaning.call)}:</strong>{" "}
                    <SuitString text={meaning.read.meaning} />
                    {meaning.read.guessed && (
                      <Typography component="span" variant="body2" color="text.secondary">
                        {" "}
                        (no rule covers this yet, so it's read as natural)
                      </Typography>
                    )}
                  </Typography>
                )}
                {confirm && hints && picked && botCall && sameCall(picked, botCall) && (
                  <Typography variant="body2" color="success.main" sx={{ mt: 0.5, fontWeight: "fontWeightMedium" }} aria-live="polite">
                    ✓ The bot would bid this too
                  </Typography>
                )}
              </Box>
            </Section>
          ) : (
            <Section
              id="their-bid"
              title={
                <>
                  {SEAT_NAMES[caller]}'s bid{" "}
                  <Typography component="span" variant="body1" color="text.secondary">
                    — {playerPlace(seat, caller, names[caller])}
                  </Typography>{" "}
                  <BiddingHelp />
                </>
              }
            >
              {null}
            </Section>
          )}
        </Box>
      )}
      {/* After a bid made with one tap (Confirm bids off), the bot hint it had no time to show. */}
      {hints && after && !mine && (
        <Typography
          variant="body2"
          color={sameCall(after.call, after.bot) ? "success.main" : "text.secondary"}
          sx={{ mt: 1, fontWeight: "fontWeightMedium" }}
          aria-live="polite"
        >
          {sameCall(after.call, after.bot) ? "✓ The bot would have bid this too" : "The bot would have bid "}
          {!sameCall(after.call, after.bot) && (after.bot.kind === "bid" ? <CallText call={after.bot} /> : callWords(after.bot))}
        </Typography>
      )}
    </Box>
  );
}

/** The "?" by the bidding box's heading: the bidding settings in the avatar menu, marking which way you bid now. */
function BiddingHelp() {
  const confirm = useConfirmBids();
  const yours = (on: boolean) => (on === confirm ? " (yours now)" : "");
  return (
    <HelpTip label="About bidding">
      <span>The menu under your initial (top right) has three settings for bidding:</span>
      <span>
        <strong>Bidding system:</strong> the SAYC choices you play. The bots bid by it, and the app uses it to explain
        bids and to judge yours. This setting is read at the start of a game, so changes only apply to future games.
      </span>
      <span>
        <strong>Bot hints:</strong> before you make a bid or play a card, it tells you whether the bot would choose it
        too. (The review after each board always shows this.)
      </span>
      <span>
        <strong>Confirm bids:</strong>
      </span>
      <Box component="ul" sx={{ m: 0, pl: 2.5, display: "grid", gap: 1 }}>
        <li>
          <strong>On</strong> (the default){yours(true)}: tap a bid, then tap Submit. Before you submit, you see what your
          bid means and, with Bot hints on, whether the bot would bid it too. Fewer misbids.
        </li>
        <li>
          <strong>Off</strong>{yours(false)}: a bid goes as soon as you tap it. Faster, but you don't see what it means
          first, and a misbid can't be undone.
        </li>
      </Box>
    </HelpTip>
  );
}

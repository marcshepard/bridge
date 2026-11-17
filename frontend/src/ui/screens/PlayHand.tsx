// Playing a board's cards on the players' devices: the board screen while the cards are played.
// Each device shows its own hand, dummy once it's down, and the trick; the cards come from the
// shared plays (the backend checks every card), so all four devices show the same table.
// When the play is over (the last card, or a claim accepted) it shows how the contract went, while
// the backend saves the result; a moment later every device moves on to the result screen.

import { Alert, Box, Button, ButtonBase, Paper, Stack, type Theme, Typography } from "@mui/material";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import type { Call } from "../../core/auction";
import { playContext } from "../../core/cardplay/context";
import { decideCard } from "../../core/cardplay/decide";
import { botClaim, checkClaim } from "../../core/cardplay/claims";
import type { TableSystems } from "../../core/bidding/system";
import { doubleDummy } from "../../services";
import { formatContract } from "../../core/contract";
import { describeResult } from "../../core/describe";
import {
  type Card,
  type Claim,
  type PlayState,
  type Trick,
  claimAnswerers,
  currentTrick,
  dummyOf,
  isComplete,
  finalTricks,
  finishedTricks,
  legalCards,
  replay,
  sameCard,
  toPlay,
  trickWinner,
  tricksLeft,
  tricksWon,
} from "../../core/play";
import { scoreResult } from "../../core/scoring";
import { type Contract, type Seat, SEATS, SEAT_NAMES, SUIT_SYMBOLS, directionOf } from "../../core/types";
import type { Board } from "../../providers/types";
import { BiddingReview } from "../components/BiddingReview";
import { CardBacksFan, Hand, HandTiles, cardBackSx } from "../components/Hand";
import { ContractText, StrainSymbol, SUIT_NAMES } from "../controls/BridgeText";
import { NumberStepper } from "../controls/NumberStepper";
import { PlayerName } from "../controls/PlayerName";
import { PlayingCard } from "../controls/PlayingCard";
import { SheetDialog } from "../controls/SheetDialog";
import { TurnStrip } from "../controls/TurnStrip";
import { relationTo } from "../labels";
import { useBotHints } from "../botHints";
import { rememberDecision } from "../botMemory";

/** How long a finished trick stays face up before it turns over by itself. */
const TURN_OVER_MS = 2000;
/** How long a bot waits before playing, so everyone can follow the trick. */
const BOT_DELAY_MS = 2000;


interface Props {
  board: Board;
  seat: Seat;
  contract: { contract: Contract; declarer: Seat };
  names: Record<Seat, string>;
  /** Players with no live connection right now: play waits for them. */
  away: Record<Seat, boolean>;
  /** Seats held by bots (practice games, dev test players). They're never "away": the creator's device plays for them. */
  bots: Seat[];
  /** This device plays the bots' cards (it's the game creator's). */
  playsForBots: boolean;
  /** The auction, when the board was bid on the devices (empty when the contract was entered by hand). */
  calls: Call[];
  /** The card each side bids and signals by (for the bots' leads and signals). */
  systems: TableSystems;
  /** The cards played so far, in order. */
  cards: Card[];
  /** The claim made on this board, if any. */
  claim: Claim | null;
  /** Sends a card (`seq` is its number on the board, 1–52); rejects with the reason if it's refused. */
  onPlay: (seq: number, card: Card) => Promise<void>;
  /** Claim this many of the tricks left, for your side. */
  /** Claim (`seat`: the owner's device claiming for a bot). */
  onClaim: (tricks: number, seat?: Seat) => Promise<void>;
  /** Accept or refuse the claim (the claimer's opponents). */
  /** Answer a claim (`seat`: the owner's device answering for a bot). */
  onAnswerClaim: (accept: boolean, seat?: Seat) => Promise<void>;
  /** The claimer takes the claim back. */
  onWithdrawClaim: () => Promise<void>;
}

export function PlayHand(p: Props) {
  const { board, seat, names, away, cards, claim } = p;
  const { declarer } = p.contract;
  const trump = p.contract.contract.strain;
  const dummy = dummyOf(declarer);
  const state = useMemo(() => replay(board.hands, trump, declarer, cards), [board, trump, declarer, cards]);
  const [hint, setHint] = useState<string | null>(null);
  // Something on its way to the backend (a card, a claim, an answer): no more taps until it's done.
  const [busy, setBusy] = useState<string | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [showAuction, setShowAuction] = useState(false);

  const tricks = finalTricks(state, claim);
  const over = tricks !== null;
  const claimPending = !!claim && !over;
  const turn = toPlay(state);
  // Declarer plays dummy's cards too; when you're dummy, you only watch.
  const yours = (s: Seat) => (s === seat && seat !== dummy) || (s === dummy && seat === declarer);
  const dummyShown = state.tricks[0]!.cards.length > 0;

  // A friendly game, not strict duplicate: each trick shows face up as it's won, then turns over
  // by itself after TURN_OVER_MS (onto the face-down pile in the trick's bottom-right corner), or as
  // soon as anyone plays to the next trick. Anyone, dummy too, can tap the pile to look back at the
  // last trick at any time; the current trick's cards are hidden while they look, and tapping the
  // pile again (or playing a card) goes back to it. The board's last trick stays face up, and can
  // be hidden and shown again.
  const finished = finishedTricks(state).length;
  const allPlayed = isComplete(state);
  const nextStarted = finished > 0 && !allPlayed && currentTrick(state).cards.length > 0;
  const [showing, setShowing] = useState<{ trick: number; how: "won" | "look" } | null>(null);
  const isOpen = finished > 0 && showing?.trick === finished;
  // Just won and not yet turned over: the bots wait for it before leading.
  const justWon = isOpen && showing?.how === "won" && !allPlayed;
  // Each trick shows as it's won (not on arriving mid-board, e.g. after a reload).
  const seen = useRef(finished);
  useEffect(() => {
    if (finished > seen.current) setShowing({ trick: finished, how: "won" });
    seen.current = finished;
  }, [finished]);
  useEffect(() => {
    if (!justWon) return;
    if (nextStarted) {
      setShowing(null);
      return;
    }
    const timer = setTimeout(() => setShowing(null), TURN_OVER_MS);
    return () => clearTimeout(timer);
  }, [justWon, nextStarted, finished]);
  const toggleTrick = finished > 0 ? () => setShowing(isOpen ? null : { trick: finished, how: "look" }) : undefined;
  // Looking back on purpose: the current trick's cards are hidden, so no card can be picked or
  // played (nor a claim made) until the last trick is closed again. A pick made before stays.
  const lookingBack = isOpen && showing?.how === "look";

  // Tap a card to pick it, then Play: the same two steps as a bid and Submit. A pick lasts until a
  // card is played (anyone's). When you have only one card you can play, it's picked for you.
  const myTurn = !over && !claim && yours(turn);
  const [pickedCard, setPickedCard] = useState<{ at: number; card: Card } | null>(null);
  const onlyCard = myTurn ? legalCards(state, turn) : [];
  const preselect = onlyCard.length === 1 ? onlyCard[0]! : null;
  const picked = myTurn ? ((pickedCard?.at === cards.length ? pickedCard.card : null) ?? preselect) : null;

  // Bot hints (the avatar menu): what the bot would play for you here, worked out as your turn
  // starts, to say so when your pick matches. A nudge, not the answer.
  const hints = useBotHints();
  const [botCard, setBotCard] = useState<{ at: number; card: Card } | null>(null);

  /** Runs one action against the backend, showing why if it's refused. */
  async function act(what: string, run: () => Promise<void>) {
    setHint(null);
    setBusy(what);
    try {
      await run();
    } catch (e) {
      setHint((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  /** Tap to pick: only in the hand whose turn it is. */
  const playFor = (s: Seat) =>
    myTurn && busy === null && turn === s && !lookingBack
      ? {
          canPlay: (card: Card) => legalCards(state, s).some((c) => sameCard(c, card)),
          picked,
          onPick: (card: Card) => {
            setHint(null);
            setPickedCard({ at: cards.length, card });
          },
          onBlocked: () => {
            const led = currentTrick(state).cards[0]!.card.suit;
            setHint(`Follow suit: play a ${SUIT_NAMES[led].slice(0, -1)} ${SUIT_SYMBOLS[led]}`);
          },
        }
      : undefined;

  function playPicked() {
    if (!picked) return;
    const card = picked;
    // Playing a card goes back to the trick in play.
    setShowing(null);
    void act("Playing your card…", () => p.onPlay(cards.length + 1, card));
  }

  const won = tricksWon(state);
  const ourSide = directionOf(seat) === directionOf(declarer) ? won.declarer : won.defence;
  const theirSide = finishedTricks(state).length - ourSide;
  const left = tricksLeft(state);

  // Who still has to answer the claim.
  const waitingOn = claim ? claimAnswerers(claim.seat, declarer).filter((s) => !claim.acceptedBy.includes(s)) : [];
  const claimText = claim
    ? `${SEAT_NAMES[claim.seat]} claims ${claim.tricks} of the ${left} ${left === 1 ? "trick" : "tricks"} left`
    : "";

  // Whoever has to play next: dummy's turn waits for declarer.
  const waitingFor = turn === dummy ? declarer : turn;

  // The bots: on the creator's device, a bot's card (or a bot declarer's dummy card) goes after a
  // pause. It's chosen by sampling with double dummy (core/cardplay), worked out during the pause; the
  // simple robot rules if double dummy isn't available. The backend takes the first card for each
  // turn, so a repeat can't play twice.
  // A bot's lead waits until the trick just won has turned over, so it lands on a clear table.
  const botTurn = !over && !claim && !justWon && p.playsForBots && p.bots.includes(waitingFor);
  const context = useMemo(() => playContext({ dealer: board.dealer, vul: board.vul }, p.calls, p.systems), [board, p.calls, p.systems]);
  // A bot considers claiming once a board (when its side's tricks are certain, it claims instead of
  // playing on); refused, it plays on.
  const claimTried = useRef(new Set<string>());
  useEffect(() => {
    if (!botTurn) return;
    let cancelled = false;
    const pause = new Promise((resolve) => setTimeout(resolve, BOT_DELAY_MS));
    const key = `${board.number}-${waitingFor}`;
    void (async () => {
      if (doubleDummy && !claimTried.current.has(key)) {
        const n = await botClaim(state, context, doubleDummy).catch(() => null);
        if (n !== null) {
          claimTried.current.add(key);
          await pause;
          if (!cancelled) void p.onClaim(n, waitingFor).catch(() => {});
          return;
        }
      }
      const [d] = await Promise.all([decideCard(state, context, doubleDummy).catch(() => decideCard(state, context, null)), pause]);
      rememberDecision(state, context, d); // for the play review
      if (!cancelled) void p.onPlay(cards.length + 1, d.card).catch(() => {});
    })();
    return () => {
      cancelled = true;
    };
  }, [botTurn, state]);

  // The bot's card for your turn, for the hint (see `hints` above).
  useEffect(() => {
    if (!myTurn || !hints) return;
    let cancelled = false;
    const at = cards.length;
    void decideCard(state, context, doubleDummy)
      .catch(() => decideCard(state, context, null))
      .then((d) => {
        if (!cancelled) setBotCard({ at, card: d.card });
      });
    return () => {
      cancelled = true;
    };
  }, [myTurn, hints, state]);
  const botAgrees = hints && !!picked && botCard?.at === cards.length && sameCard(botCard.card, picked);

  // A claim the bots have to answer: the owner's device checks it for each of them in turn.
  const botAnswerer = claim && p.playsForBots ? claimAnswerers(claim.seat, declarer).find((s) => p.bots.includes(s) && !claim.acceptedBy.includes(s)) : undefined;
  useEffect(() => {
    if (!claim || !botAnswerer) return;
    let cancelled = false;
    const pause = new Promise((resolve) => setTimeout(resolve, BOT_DELAY_MS));
    void (async () => {
      const verdict = doubleDummy ? await checkClaim(state, claim, botAnswerer, context, doubleDummy).catch(() => ({ accept: true })) : { accept: true };
      await pause;
      if (!cancelled) void p.onAnswerClaim(verdict.accept, botAnswerer).catch(() => {});
    })();
    return () => {
      cancelled = true;
    };
  }, [claim?.seat, claim?.tricks, botAnswerer]);
  const resultText =
    tricks === null
      ? ""
      : `${describeResult(scoreResult({ contract: p.contract.contract, declarer, tricks }, board.vul))}: ${tricks} ${tricks === 1 ? "trick" : "tricks"}`;
  // Whose turn it is, in the middle of the contract row: "Your turn", "Dummy's turn" or "East's
  // turn". When it's yours (your hand, or dummy's when you're declarer) it's in the primary colour,
  // pulsing. Nothing once play stops.
  const awayNote = away[waitingFor] && !p.bots.includes(waitingFor) ? " (away)" : "";
  const turnLabel =
    over || claim
      ? ""
      : turn === dummy
        ? `Dummy's turn${myTurn ? "" : awayNote}`
        : myTurn
          ? "Your turn"
          : `${SEAT_NAMES[turn]}'s turn${awayNote}`;
  // The line below: why a card can't go, what's happening, or how the play went.
  const statusText = over
    ? resultText
    : busy
      ? busy
      : claim
        ? `${claimText}: waiting for ${waitingOn.map((s) => SEAT_NAMES[s]).join(" and ")}`
        : preselect
          ? "Only one card can go: it's picked for you"
          : "";

  // Dummy can peek at partner's (declarer's) hand: not strict bridge, but a friendly game, and
  // dummy has no cards to play. Hidden again on each new board.
  const canPeek = seat === dummy && dummyShown && !over;
  const [peek, setPeek] = useState(false);
  useEffect(() => setPeek(false), [board.number]);

  /** A seat you can't see into: who's there, how many cards (and their backs), and a highlight when it's their turn. */
  const closed = (s: Seat) => {
    const count = Object.values(state.hands[s]).join("").length;
    const peekable = canPeek && s === declarer;
    return (
      <SeatBox key={s} active={!over && !claim && turn === s} title={peekable && peek ? `${SEAT_NAMES[s]}: partner's hand` : SEAT_NAMES[s]}>
        <Typography variant="body2" color="text.secondary" component="div">
          <PlayerName name={names[s]} away={away[s]} /> · {count} {count === 1 ? "card" : "cards"}
        </Typography>
        {peekable && peek ? (
          <Hand hand={state.hands[s]} trump={trump} />
        ) : (
          <Box sx={{ mt: 0.5 }}>
            <CardBacksFan count={count} />
          </Box>
        )}
        {peekable && (
          <Button variant="outlined" size="small" sx={{ mt: 0.5 }} onClick={() => setPeek(!peek)}>
            {peek ? "Hide hand" : "Show hand"}
          </Button>
        )}
      </SeatBox>
    );
  };

  /** What sits at each edge: dummy's cards once it's down, a claimer's cards, else just who's there. */
  const edge = (s: Seat): ReactNode => {
    if (s === seat) return null;
    if (claim?.seat === s && s !== dummy) {
      return (
        <SeatBox key={s} active={false} title={`${SEAT_NAMES[s]}: claiming`}>
          <Hand hand={state.hands[s]} trump={trump} />
        </SeatBox>
      );
    }
    if (s !== dummy || !dummyShown) return closed(s);
    const side = relationTo(seat, s) !== "partner";
    return (
      <SeatBox key={s} active={!over && !claim && turn === s} title={`Dummy: ${SEAT_NAMES[s]}`}>
        {/* Dummy on your left or right is only ever looked at, so it's a compact suit-per-row list. */}
        {side ? (
          <Hand hand={state.hands[s]} trump={trump} />
        ) : (
          <HandTiles hand={state.hands[s]} trump={trump} short inPlay label="Dummy's cards" play={playFor(s)} />
        )}
      </SeatBox>
    );
  };
  const at = (r: "partner" | "lho" | "rho") => SEATS.find((s) => relationTo(seat, s) === r)!;

  return (
    <Box component="section" aria-label="Card play">
      {/* The status strip: the contract, whose turn it is and tricks for each side, then a line for
          why a card can't go, what's happening, or how the play went. The turn sits in a fixed-size
          box and the line below always takes its height, so nothing moves under your finger. */}
      <TurnStrip
        left={
          // Bid on the devices: the contract is a button that opens the bidding review (meanings only).
          p.calls.length > 0 ? (
            <Button
              variant="outlined"
              onClick={() => setShowAuction(true)}
              aria-label={`${formatContract(p.contract.contract)} by ${SEAT_NAMES[declarer]}. Show the auction`}
              sx={{ display: "block", textAlign: "left", minWidth: 0, px: 1, py: 0.25, lineHeight: 1.2 }}
            >
              <Typography variant="h6" component="h1" sx={{ lineHeight: 1.2 }} noWrap>
                <ContractText contract={p.contract.contract} />
              </Typography>
              <Typography variant="caption" component="span" color="text.secondary" sx={{ display: "block" }} noWrap>
                by {SEAT_NAMES[declarer]} · auction
              </Typography>
            </Button>
          ) : (
            <Typography variant="h6" component="h1" sx={{ lineHeight: 1.2 }} noWrap>
              <ContractText contract={p.contract.contract} />
              <Typography variant="caption" component="span" color="text.secondary" sx={{ display: "block" }} noWrap>
                by {SEAT_NAMES[declarer]}
              </Typography>
            </Typography>
          )
        }
        turn={turnLabel}
        mine={myTurn}
        right={
          <Typography
            variant="caption"
            color="text.secondary"
            className="num"
            aria-label={`Tricks: you ${ourSide}, them ${theirSide}`}
            sx={{ lineHeight: 1.3 }}
          >
            You {ourSide}
            <br />
            Them {theirSide}
          </Typography>
        }
      />
      <Typography variant="subtitle1" noWrap sx={{ mb: 1 }} aria-live="polite" color={hint ? "error" : undefined}>
        {hint ?? (statusText || " ")}
      </Typography>

      {/* A claim waiting for answers: what it is, and what you can do about it. */}
      {claimPending && claim && (
        <Alert
          severity="info"
          sx={{ mb: 1 }}
          action={
            waitingOn.includes(seat) ? (
              <Stack direction="row" spacing={1}>
                <Button color="inherit" disabled={busy !== null} onClick={() => void act("Refusing…", () => p.onAnswerClaim(false))}>
                  Refuse
                </Button>
                <Button
                  variant="contained"
                  disabled={busy !== null}
                  onClick={() => void act("Accepting…", () => p.onAnswerClaim(true))}
                >
                  Accept
                </Button>
              </Stack>
            ) : claim.seat === seat ? (
              <Button color="inherit" disabled={busy !== null} onClick={() => void act("Taking it back…", p.onWithdrawClaim)}>
                Take it back
              </Button>
            ) : undefined
          }
        >
          {claimText}.{" "}
          {waitingOn.includes(seat)
            ? "Accept if you can't do better, or refuse to play on."
            : `Waiting for ${waitingOn.map((s) => SEAT_NAMES[s]).join(" and ")}.`}
        </Alert>
      )}

      <Stack spacing={1}>
        {edge(at("partner"))}
        <Box sx={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 1, alignItems: "center" }}>
          {edge(at("lho"))}
          <TrickView state={state} seat={seat} open={isOpen} />
          {edge(at("rho"))}
        </Box>
        {/* The warning only while you're looking back on purpose, not during a trick's moment face up as it's won. */}
        <TrickRow
          state={state}
          open={isOpen}
          yourTurn={myTurn && lookingBack}
          onToggle={toggleTrick ?? (() => {})}
        />
        <SeatBox
          active={!over && !claim && turn === seat && yours(seat)}
          title={seat === dummy && dummyShown ? "You're dummy: partner is playing your cards" : `You: ${SEAT_NAMES[seat]}`}
        >
          <HandTiles hand={state.hands[seat]} trump={trump} inPlay play={playFor(seat)} />
        </SeatBox>
        {/* Play the picked card (it says which, and "from dummy" when it's dummy's), and Claim beside it. */}
        {!over && !claim && seat !== dummy && (
          <Stack direction="row" spacing={1} sx={{ justifyContent: "center", pt: 1 }}>
            <Button variant="outlined" disabled={lookingBack} onClick={() => setClaiming(true)}>
              Claim
            </Button>
            <Button
              variant="contained"
              size="large"
              disabled={!myTurn || !picked || busy !== null || lookingBack}
              onClick={playPicked}
              aria-label={picked ? `Play the ${cardWords(picked)}${turn === dummy ? " from dummy" : ""}` : undefined}
              sx={{ minWidth: (t) => t.spacing(20) }}
            >
              {/* One span, so the label flows as text: in the button's flex row, " from dummy" on its own
                  would lose its leading space. */}
              <span>
                Play
                {picked && (
                  <>
                    &nbsp;{picked.rank === "T" ? "10" : picked.rank}
                    <StrainSymbol strain={picked.suit} />
                    {turn === dummy && " from dummy"}
                  </>
                )}
              </span>
            </Button>
          </Stack>
        )}
        {botAgrees && (
          <Typography variant="body2" color="success.main" sx={{ textAlign: "center", fontWeight: "fontWeightMedium" }} aria-live="polite">
            ✓ The bot would play this too
          </Typography>
        )}
      </Stack>

      <SheetDialog
        open={showAuction}
        onClose={() => setShowAuction(false)}
        title="The auction"
        actions={<Button onClick={() => setShowAuction(false)}>Close</Button>}
      >
        <BiddingReview board={board} calls={p.calls} seat={seat} names={names} bots={p.bots} systems={p.systems} meaningsOnly />
      </SheetDialog>

      {claiming && (
        <ClaimDialog
          left={left}
          onClose={() => setClaiming(false)}
          onClaim={(n) => {
            setClaiming(false);
            void act("Claiming…", () => p.onClaim(n));
          }}
        />
      )}
    </Box>
  );
}

/** How many of the tricks left your side will take. Your cards are shown to everyone. */
function ClaimDialog({ left, onClose, onClaim }: { left: number; onClose: () => void; onClaim: (tricks: number) => void }) {
  const [tricks, setTricks] = useState(left);
  return (
    <SheetDialog
      open
      onClose={onClose}
      title="Claim"
      actions={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="contained" onClick={() => onClaim(tricks)}>
            Claim {tricks} of {left}
          </Button>
        </>
      }
    >
      <Typography>
        Say how many of the {left} {left === 1 ? "trick" : "tricks"} left your side will take. Your cards are shown to
        everyone, and play stops until your opponents answer. If they accept, that's the result; if either refuses, play
        goes on.
      </Typography>
      <NumberStepper
        label="Tricks your side will take"
        value={tricks}
        min={0}
        max={left}
        onChange={setTricks}
        lessLabel="One trick fewer"
        moreLabel="One trick more"
        caption={tricks === left ? "All of them" : tricks === 0 ? "None of them" : `of ${left}`}
      />
    </SheetDialog>
  );
}

function SeatBox({ title, active, children }: { title: string; active: boolean; children: ReactNode }) {
  return (
    <Paper
      variant="outlined"
      sx={{
        p: 1,
        ...(active && {
          borderColor: "primary.main",
          bgcolor: "action.selected",
        }),
      }}
    >
      <Typography variant="caption" component="p" color="text.secondary" sx={{ mb: 0.5 }}>
        {title}
      </Typography>
      {children}
    </Paper>
  );
}

/**
 * The trick in the middle, each card on its player's side. The last finished trick shows while it's
 * open (face up), even after the next lead. Once a trick is won, a face-down pile sits in the bottom-
 * right corner; tapping it (when `onToggle` is given) shows or hides the last trick, during the next
 * trick too.
 */
function TrickView({
  state,
  seat,
  open,
}: {
  state: PlayState;
  seat: Seat;
  /** The last finished trick is open (face up) on this device. */
  open: boolean;
}) {
  const now = currentTrick(state);
  const last = finishedTricks(state).at(-1);
  // Between tricks, and once the last trick is in: the trick just won.
  const between = (now.cards.length === 0 || now.cards.length === 4) && !!last;
  // The last trick shows while it's open, or face down between tricks.
  const showingLast = !!last && (open || between);
  const trick: Trick = showingLast ? last : now;
  const number = state.tricks.indexOf(trick) + 1;
  const winner = trick.cards.length === 4 ? trickWinner(trick, state.trump)!.seat : null;
  const faceUp = !showingLast || open;
  const AREA = {
    partner: "top",
    lho: "left",
    rho: "right",
    you: "bottom",
  } as const;

  const table = (
    <Box
      sx={{
        display: "grid",
        gridTemplateAreas: '". top ." "left middle right" ". bottom ."',
        // A fixed size, so the table doesn't jump about as cards come and go.
        gridTemplateColumns: (t) => `repeat(3, ${t.spacing(5)})`,
        gridTemplateRows: (t) => `repeat(3, ${t.spacing(7)})`,
        gap: 0.5,
        justifyContent: "center",
      }}
    >
      {faceUp &&
        trick.cards.map(({ seat: s, card }) => (
          <Box key={s} sx={{ gridArea: AREA[relationTo(seat, s)] }}>
            <PlayingCard
              card={card}
              won={s === winner}
              label={`${SEAT_NAMES[s]}: ${card.rank === "T" ? "10" : card.rank} of ${SUIT_NAMES[card.suit]}`}
            />
          </Box>
        ))}
    </Box>
  );

  return (
    // Centred: the trick's cards centre their rank and suit by it.
    <Box role="group" aria-label={`Trick ${number}`} sx={{ textAlign: "center" }}>
      {table}
    </Box>
  );
}

/**
 * The row under the trick, always the same height so nothing below it moves. Before a trick is won:
 * who led trick 1. Then the last trick's pile, face down, as the button that turns the last
 * trick face up in the middle and back, with what it does beside it while closed. While the last
 * trick is open: just the pile, unless it's your turn, when the row becomes a warning that you
 * still have to close it to play.
 */
function TrickRow({ state, open, yourTurn, onToggle }: { state: PlayState; open: boolean; yourTurn: boolean; onToggle: () => void }) {
  const done = finishedTricks(state);
  const finished = done.length;
  const now = currentTrick(state);
  const height = (t: Theme) => t.spacing(7);
  if (finished === 0) {
    return (
      <Box sx={{ minHeight: height, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Typography variant="body2" color="text.secondary">
          Trick 1{now.cards.length > 0 ? ` · ${SEAT_NAMES[now.leader]} led` : ""}
        </Typography>
      </Box>
    );
  }
  const winner = trickWinner(done.at(-1)!, state.trump)!.seat;
  // Your turn while you look back: the whole row is one warning-coloured button that closes the
  // last trick (a banner that does something is the button itself, with nothing else inside).
  if (open && yourTurn && !isComplete(state)) {
    return (
      <ButtonBase
        onClick={onToggle}
        aria-live="polite"
        sx={(t) => ({
          width: 1,
          minHeight: height(t),
          px: 2,
          borderRadius: 1,
          bgcolor: "warning.light",
          color: "warning.contrastText",
          typography: "body2",
          fontWeight: "fontWeightMedium",
          "&:hover": { bgcolor: "warning.main" },
          "&.Mui-focusVisible": { outline: `${t.spacing(0.25)} solid ${t.vars!.palette.primary.main}` },
        })}
      >
        It's your turn to play to trick {finished + 1}. Tap here to close trick {finished}.
      </ButtonBase>
    );
  }
  const pile = (
    <ButtonBase
      onClick={onToggle}
      aria-label={open ? `Close trick ${finished}` : `Review trick ${finished}, won by ${SEAT_NAMES[winner]}`}
      aria-pressed={open}
      sx={(t) => ({
        flexShrink: 0,
        position: "relative",
        borderRadius: 1,
        // At least 44px to tap, around a pile smaller than that.
        "&::before": { content: '""', position: "absolute", inset: `-${t.spacing(0.5)}` },
        "&.Mui-focusVisible": { outline: `${t.spacing(0.25)} solid ${t.vars!.palette.primary.main}` },
      })}
    >
      <TrickPile open={open} />
    </ButtonBase>
  );
  return (
    <Box
      aria-live="polite"
      sx={{
        minHeight: height,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 1.5,
        px: 1,
      }}
    >
      {pile}
      {!open && (
        <Typography variant="body2" color="text.secondary">
          ← Tap to review last trick
        </Typography>
      )}
    </Box>
  );
}

/**
 * The last trick, face down: a small, tightly overlapped fan of its four card backs (the same backs
 * as the hidden hands). Always four, whatever the trick number, since it stands for the trick you
 * can turn up. Outlined in the primary colour while the last trick is turned up.
 */
function TrickPile({ open }: { open: boolean }) {
  return (
    <Box aria-hidden sx={{ display: "flex" }}>
      {Array.from({ length: 4 }, (_, i) => (
        <Box
          key={i}
          sx={(t) => ({
            flexShrink: 0,
            width: t.spacing(3),
            height: t.spacing(4.25),
            ml: i === 0 ? 0 : `calc(${t.spacing(3)} * -0.85)`,
            ...cardBackSx(t, t.spacing(0.2)),
            ...(open && { borderColor: "primary.main" }),
            borderRadius: 0.5,
          })}
        />
      ))}
    </Box>
  );
}

/** "7 of spades", "10 of hearts", "queen of clubs": a card in words, for screen readers. */
function cardWords(card: Card): string {
  const rank = { A: "ace", K: "king", Q: "queen", J: "jack", T: "10" }[card.rank] ?? card.rank;
  return `${rank} of ${SUIT_NAMES[card.suit]}`;
}

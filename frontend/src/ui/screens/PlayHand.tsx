// Playing a board's cards on the players' devices: the board screen while the cards are played.
// Each device shows its own hand, dummy once it's down, and the trick; the cards come from the
// shared plays (the backend checks every card), so all four devices show the same table.
// When the play is over (the last card, or a claim accepted) it shows how the contract went, while
// the backend saves the result; a moment later every device moves on to the result screen.

import { Alert, Box, Button, Paper, Stack, Typography } from "@mui/material";
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
import { Hand, HandTiles } from "../components/Hand";
import { ContractText, SUIT_NAMES } from "../controls/BridgeText";
import { NumberStepper } from "../controls/NumberStepper";
import { PlayerName } from "../controls/PlayerName";
import { PlayingCard } from "../controls/PlayingCard";
import { SheetDialog } from "../controls/SheetDialog";
import { TurnStrip } from "../controls/TurnStrip";
import { relationTo } from "../labels";
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
  // by itself after TURN_OVER_MS, or as soon as anyone plays to the next trick. Anyone, dummy too,
  // can tap "See trick N" under the trick to look back at the last one at any time; the current
  // trick's cards are hidden while they look, and "Hide trick N" (or playing a card) goes back to
  // it. The board's last trick stays face up, and can be hidden and shown again.
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

  // When you have only one card you can play, it's picked for you: one tap plays it.
  const onlyCard = !over && !claim && yours(turn) ? legalCards(state, turn) : [];
  const preselect = onlyCard.length === 1 ? onlyCard[0]! : null;

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

  /** Tap to pick, tap again to play: only for the hand whose turn it is. */
  const playFor = (s: Seat) =>
    !over && !claim && busy === null && turn === s && yours(s)
      ? {
          canPlay: (card: Card) => legalCards(state, s).some((c) => sameCard(c, card)),
          onPlay: (card: Card) => {
            // Playing a card goes back to the trick in play.
            setShowing(null);
            void act("Playing your card…", () => p.onPlay(cards.length + 1, card));
          },
          preselect,
          onBlocked: () => {
            const led = currentTrick(state).cards[0]!.card.suit;
            setHint(`Follow suit: play a ${SUIT_NAMES[led].slice(0, -1)} ${SUIT_SYMBOLS[led]}`);
          },
        }
      : undefined;

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
  const myTurn = !over && !claim && yours(turn);
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
          ? "Only one card can go: tap it to play"
          : "";

  /** A seat you can't see into: who's there, how many cards, and a highlight when it's their turn. */
  const closed = (s: Seat) => (
    <SeatBox key={s} active={!over && !claim && turn === s} title={SEAT_NAMES[s]}>
      <Typography variant="body2" color="text.secondary" component="div">
        <PlayerName name={names[s]} away={away[s]} /> · {Object.values(state.hands[s]).join("").length} cards
      </Typography>
    </SeatBox>
  );

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
          <TrickView state={state} seat={seat} open={isOpen} onToggle={toggleTrick} />
          {edge(at("rho"))}
        </Box>
        <SeatBox
          active={!over && !claim && turn === seat && yours(seat)}
          title={seat === dummy && dummyShown ? "You're dummy: partner is playing your cards" : `You: ${SEAT_NAMES[seat]}`}
        >
          <HandTiles hand={state.hands[seat]} trump={trump} inPlay play={playFor(seat)} />
        </SeatBox>
        <Stack direction="row" spacing={1} sx={{ justifyContent: "center", pt: 1 }}>
          {!over && !claim && seat !== dummy && (
            <Button variant="outlined" onClick={() => setClaiming(true)}>
              Claim
            </Button>
          )}
        </Stack>
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
 * open (face up), even after the next lead; closed, it lies face down until the next lead. Under it,
 * "See trick N" / "Hide trick N" (when `onToggle` is given) shows or hides the last trick, during
 * the next trick too.
 */
function TrickView({
  state,
  seat,
  open,
  onToggle,
}: {
  state: PlayState;
  seat: Seat;
  /** The last finished trick is open (face up) on this device. */
  open: boolean;
  /** Present once a trick has been won: shows or hides the last one. */
  onToggle?: () => void;
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
      {faceUp ? (
        trick.cards.map(({ seat: s, card }) => (
          <Box key={s} sx={{ gridArea: AREA[relationTo(seat, s)] }}>
            <PlayingCard
              card={card}
              won={s === winner}
              label={`${SEAT_NAMES[s]}: ${card.rank === "T" ? "10" : card.rank} of ${SUIT_NAMES[card.suit]}`}
            />
          </Box>
        ))
      ) : (
        <Box sx={{ gridArea: "middle" }}>
          <CardBack />
        </Box>
      )}
    </Box>
  );

  const lastNumber = last ? state.tricks.indexOf(last) + 1 : 0;
  const caption = showingLast
    ? `Trick ${number}: ${SEAT_NAMES[winner!]} won it`
    : `Trick ${number}${trick.cards.length > 0 ? ` · ${SEAT_NAMES[trick.leader]} led` : ""}`;
  // Face up: the last trick is showing, so the button hides it again.
  const lastShowing = showingLast && faceUp;

  return (
    <Box sx={{ textAlign: "center" }}>
      <Box role="group" aria-label={`Trick ${number}`}>
        {table}
      </Box>
      {/* Side by side where there's room. On a narrow phone the middle column stays as narrow as the
          table, so East's and West's cards keep their space, and the button wraps under the words. */}
      <Box
        sx={(t) => ({
          mt: 0.5,
          mx: "auto",
          maxWidth: { xs: t.spacing(17), sm: "none" },
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          alignItems: "center",
          columnGap: 1,
          rowGap: 0.5,
        })}
      >
        <Typography variant="body2" component="p" color="text.secondary">
          {caption}
        </Typography>
        {onToggle && (
          <Button
            variant="outlined"
            size="small"
            onClick={onToggle}
            // About the height of the words beside it, with the usual 44px tap area around it.
            sx={(t) => ({
              minHeight: t.spacing(3.5),
              py: 0,
              position: "relative",
              "&::before": { content: '""', position: "absolute", inset: `-${t.spacing(0.75)} 0` },
            })}
          >
            {lastShowing ? `Hide trick ${lastNumber}` : `See trick ${lastNumber}`}
          </Button>
        )}
      </Box>
    </Box>
  );
}

/** The last trick, gathered up face down. */
function CardBack() {
  return (
    <Box
      aria-hidden
      sx={{
        width: (t) => t.spacing(5),
        height: (t) => t.spacing(7),
        bgcolor: "secondary.main",
        border: 1,
        borderColor: "card.edge",
        borderRadius: 1,
        boxShadow: 2,
      }}
    />
  );
}

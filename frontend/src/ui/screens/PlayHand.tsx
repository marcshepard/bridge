// Playing a board's cards on the players' devices: the board screen while the cards are played.
// Each device shows its own hand, dummy once it's down, and the trick; the cards come from the
// shared plays (the backend checks every card), so all four devices show the same table.
// When the play is over (the last card, or a claim accepted) it shows how the contract went, and
// anyone can enter the result.

import { Alert, Box, Button, ButtonBase, Paper, Stack, Typography } from "@mui/material";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { describeResult } from "../../core/describe";
import {
  type Card,
  type Claim,
  type PlayState,
  type Trick,
  claimAnswerers,
  currentTrick,
  dummyOf,
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
import { Hand, HandTiles } from "../components/Hand";
import { ContractText, SUIT_NAMES } from "../controls/BridgeText";
import { NumberStepper } from "../controls/NumberStepper";
import { PlayerName } from "../controls/PlayerName";
import { SheetDialog } from "../controls/SheetDialog";
import { relationTo } from "../labels";

/** How long a finished trick stays face up before it's turned face down. */
const TURN_DOWN_MS = 1500;

interface Props {
  board: Board;
  seat: Seat;
  contract: { contract: Contract; declarer: Seat };
  names: Record<Seat, string>;
  /** Players with no live connection right now: play waits for them. */
  away: Record<Seat, boolean>;
  /** The cards played so far, in order. */
  cards: Card[];
  /** The claim made on this board, if any. */
  claim: Claim | null;
  /** Sends a card (`seq` is its number on the board, 1–52); rejects with the reason if it's refused. */
  onPlay: (seq: number, card: Card) => Promise<void>;
  /** Claim this many of the tricks left, for your side. */
  onClaim: (tricks: number) => Promise<void>;
  /** Accept or refuse the claim (the claimer's opponents). */
  onAnswerClaim: (accept: boolean) => Promise<void>;
  /** The claimer takes the claim back. */
  onWithdrawClaim: () => Promise<void>;
  /** Once play is over: save the result (declarer's tricks), for everyone. */
  onEnterResult: (tricks: number) => Promise<void>;
  /** The game's creator can stop playing the board on the devices (the cards played are thrown away). */
  onStop?: () => void;
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

  const tricks = finalTricks(state, claim);
  const over = tricks !== null;
  const claimPending = !!claim && !over;
  const turn = toPlay(state);
  // Declarer plays dummy's cards too; when you're dummy, you only watch.
  const yours = (s: Seat) => (s === seat && seat !== dummy) || (s === dummy && seat === declarer);
  const dummyShown = state.tricks[0]!.cards.length > 0;

  // When you have only one card you can play, it's picked for you: one tap plays it.
  const onlyCard = !over && !claim && yours(turn) ? legalCards(state, turn) : [];
  const preselect = onlyCard.length === 1 ? onlyCard[0]! : null;

  // A finished trick shows face up for a moment, then lies face down in the middle until the next
  // lead. Anyone can tap it to see it again ("peek") meanwhile, and after the last trick too.
  const finished = finishedTricks(state).length;
  const [lastTrick, setLastTrick] = useState<"just-won" | "peek" | null>(null);
  useEffect(() => {
    if (finished === 0) return;
    setLastTrick("just-won");
    const timer = setTimeout(() => setLastTrick((v) => (v === "just-won" ? null : v)), TURN_DOWN_MS);
    return () => clearTimeout(timer);
  }, [finished]);

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
          onPlay: (card: Card) => void act("Playing your card…", () => p.onPlay(cards.length + 1, card)),
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
  const resultText =
    tricks === null
      ? ""
      : `${describeResult(scoreResult({ contract: p.contract.contract, declarer, tricks }, board.vul))}: ${tricks} ${tricks === 1 ? "trick" : "tricks"}`;
  const turnText = over
    ? resultText
    : busy
      ? busy
      : claim
        ? `${claimText}: waiting for ${waitingOn.map((s) => SEAT_NAMES[s]).join(" and ")}`
        : preselect
          ? "Your only card to play is picked: tap it to play"
          : yours(turn)
            ? turn === dummy
              ? "Your turn: play from dummy"
              : "Your turn"
            : `${SEAT_NAMES[waitingFor]} to play${turn === dummy ? " from dummy" : ""}${away[waitingFor] ? " (away)" : "…"}`;

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
          <Hand hand={state.hands[s]} />
        </SeatBox>
      );
    }
    if (s !== dummy || !dummyShown) return closed(s);
    const side = relationTo(seat, s) !== "partner";
    return (
      <SeatBox key={s} active={!over && !claim && turn === s} title={`Dummy: ${SEAT_NAMES[s]}`}>
        {/* Dummy on your left or right is only ever looked at, so it's a compact suit-per-row list. */}
        {side ? (
          <Hand hand={state.hands[s]} />
        ) : (
          <HandTiles hand={state.hands[s]} trump={trump} short inPlay label="Dummy's cards" play={playFor(s)} />
        )}
      </SeatBox>
    );
  };
  const at = (r: "partner" | "lho" | "rho") => SEATS.find((s) => relationTo(seat, s) === r)!;

  return (
    <Box component="section" aria-label="Card play">
      {/* The status strip: the contract and tricks for each side, then whose turn it is (or why a card can't go). */}
      <Stack direction="row" spacing={1} sx={{ alignItems: "baseline" }}>
        <Typography variant="h6" component="h1" sx={{ flex: 1 }} noWrap>
          <ContractText contract={p.contract.contract} /> by {SEAT_NAMES[declarer]}
        </Typography>
        <Typography variant="body2" color="text.secondary" className="num" noWrap>
          Tricks: you {ourSide}, them {theirSide}
        </Typography>
      </Stack>
      <Typography variant="subtitle1" noWrap sx={{ mb: 1 }} aria-live="polite" color={hint ? "error" : undefined}>
        {hint ?? turnText}
      </Typography>

      {/* The play is over: how it went, and one tap to enter it for everyone. */}
      {over && (
        <Button
          variant="contained"
          size="large"
          fullWidth
          disabled={busy !== null}
          onClick={() => void act("Saving the result…", () => p.onEnterResult(tricks))}
          sx={{ mb: 1 }}
        >
          Enter the result
        </Button>
      )}

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
          <TrickView
            state={state}
            seat={seat}
            lastTrick={lastTrick}
            onToggleLast={() => setLastTrick((v) => (v ? null : "peek"))}
          />
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
          {p.onStop && (
            <Button variant="outlined" onClick={p.onStop}>
              Stop playing
            </Button>
          )}
        </Stack>
      </Stack>

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
 * The trick in the middle, each card on its player's side. Between tricks the last one lies face
 * down until the next lead; tap it to turn it face up (and again to turn it back).
 */
function TrickView({
  state,
  seat,
  lastTrick,
  onToggleLast,
}: {
  state: PlayState;
  seat: Seat;
  lastTrick: "just-won" | "peek" | null;
  onToggleLast: () => void;
}) {
  const now = currentTrick(state);
  const last = finishedTricks(state).at(-1);
  // Between tricks, and once the last trick is in: the trick just won.
  const between = (now.cards.length === 0 || now.cards.length === 4) && !!last;
  const trick: Trick = between ? last : now;
  const number = state.tricks.indexOf(trick) + 1;
  const winner = trick.cards.length === 4 ? trickWinner(trick, state.trump)!.seat : null;
  const faceUp = !between || lastTrick !== null;
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
            <TrickCard
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

  const caption = between
    ? `Trick ${number}: ${SEAT_NAMES[winner!]} won it · ${faceUp ? "tap to turn over" : "tap to see it"}`
    : `Trick ${number}${trick.cards.length > 0 ? ` · ${SEAT_NAMES[trick.leader]} led` : ""}`;

  return (
    <Box sx={{ textAlign: "center" }}>
      {between ? (
        <ButtonBase
          onClick={onToggleLast}
          aria-label={
            faceUp ? `Trick ${number}, won by ${SEAT_NAMES[winner!]}. Turn it face down` : `Trick ${number}, face down. Show it`
          }
          sx={{
            display: "block",
            borderRadius: 1,
            "&.Mui-focusVisible": {
              outline: (t) => `${t.spacing(0.25)} solid ${t.palette.primary.main}`,
            },
          }}
        >
          {table}
        </ButtonBase>
      ) : (
        <Box role="group" aria-label={`Trick ${number}`}>
          {table}
        </Box>
      )}
      <Typography
        variant="caption"
        component="p"
        color="text.secondary"
        sx={{ mt: 0.5, maxWidth: (t) => t.spacing(17), mx: "auto" }}
      >
        {caption}
      </Typography>
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

function TrickCard({ card, won, label }: { card: Card; won: boolean; label: string }) {
  return (
    <Box
      aria-label={label}
      sx={{
        width: (t) => t.spacing(5),
        height: (t) => t.spacing(7),
        bgcolor: "card.face",
        border: 1,
        borderColor: won ? "primary.main" : "card.edge",
        boxShadow: won ? 4 : 1,
        borderRadius: 1,
        color: card.suit === "H" || card.suit === "D" ? "card.red" : "card.ink",
        typography: "subtitle1",
        fontWeight: "fontWeightBold",
        lineHeight: 1.1,
        pt: 0.5,
      }}
    >
      {card.rank === "T" ? "10" : card.rank}
      <br />
      {SUIT_SYMBOLS[card.suit]}
    </Box>
  );
}

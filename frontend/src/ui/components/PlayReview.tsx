// The play review: a finished board's play, trick by trick, with all four hands face up as they were
// when the trick started, and you at the bottom, as at the table. Tap a trick's number to go to it,
// and a card in the trick to see what it was: for your cards (your seat, and dummy's when you
// declared), how it compares with the others on the odds from your seat (core/cardplay/review.ts);
// for a bot's card, its reason; for another person's, nothing (feedback is only for the player it's
// about). The figures behind a verdict open from Details.
//
// The analysis runs in the background, your cards first; the marks appear as they're worked out.

import { Alert, Box, Button, ButtonBase, Stack, Typography } from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import type { Call } from "../../core/auction";
import { playContext } from "../../core/cardplay/context";
import type { CardGroup } from "../../core/cardplay/decide";
import { type CardReview, type PlayMark, reviewCard } from "../../core/cardplay/review";
import { decider } from "../../core/cardplay/sample";
import type { TableSystems } from "../../core/bidding/system";
import { type Card, cardCode, dummyOf, replay, toPlay, trickWinner } from "../../core/play";
import { type Contract, type Seat, SEAT_NAMES, SEATS } from "../../core/types";
import type { Board } from "../../providers/types";
import { doubleDummy } from "../../services";
import { recallDecision } from "../botMemory";
import { ContractText, SUIT_NAMES, SuitString } from "../controls/BridgeText";
import { PlayingCard } from "../controls/PlayingCard";
import { SheetDialog } from "../controls/SheetDialog";
import { relationTo } from "../labels";
import { Hand } from "./Hand";

const PLAY_MARKS: Record<PlayMark, { symbol: string; color: string; name: string }> = {
  mistake: { symbol: "✗", color: "error.main", name: "a mistake" },
  close: { symbol: "≈", color: "warning.main", name: "a close call" },
  unlucky: { symbol: "?", color: "info.main", name: "unlucky" },
};
/** Worst first: a trick's number shows its worst mark. */
const MARK_ORDER: PlayMark[] = ["mistake", "close", "unlucky"];

interface Props {
  board: Board;
  contract: { contract: Contract; declarer: Seat };
  /** The auction (empty when the contract was entered by hand): what the bidding told the players. */
  calls: Call[];
  /** Every card played, in order (fewer than 52 after a claim). */
  cards: Card[];
  /** Your seat. */
  seat: Seat;
  names: Record<Seat, string>;
  /** Seats held by bots. */
  bots: Seat[];
  systems: TableSystems;
  /** The tricks declarer took (a claim included). */
  tricks: number | null;
}

/** "♠K", the way the bots' reasons write a card. */
const cardWords = (c: Card) => `${{ S: "♠", H: "♥", D: "♦", C: "♣" }[c.suit]}${c.rank === "T" ? "10" : c.rank}`;
const pct = (x: number) => `${Math.round(x * 100)}%`;
const groupWords = (g: CardGroup) => g.cards.map(cardWords).join(" or ");
const trickOf = (i: number) => Math.floor(i / 4);

export function PlayReview({ board, contract, calls, cards, seat, names, bots, systems, tricks }: Props) {
  const { declarer } = contract;
  const trump = contract.contract.strain;
  const dummy = dummyOf(declarer);
  const ctx = useMemo(() => playContext({ dealer: board.dealer, vul: board.vul }, calls, systems), [board, calls, systems]);
  // The position before each card, and the play as a whole.
  const states = useMemo(() => cards.map((_, i) => replay(board.hands, trump, declarer, cards.slice(0, i))), [board, trump, declarer, cards]);
  const whole = useMemo(() => replay(board.hands, trump, declarer, cards), [board, trump, declarer, cards]);
  // Who chose each card (declarer chooses dummy's), and whose cards are judged: yours.
  const chooser = states.map((st) => decider(st, toPlay(st)));
  const yours = (i: number) => chooser[i] === seat && seat !== dummy;
  const isBot = (i: number) => bots.includes(chooser[i]!);

  const [reviews, setReviews] = useState<Record<number, CardReview>>({});
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setReviews({});
    if (!doubleDummy) return;
    const solver = doubleDummy;
    let cancelled = false;
    // Your cards first (they get marks), then the bots'.
    const order = [...cards.keys()].filter(yours).concat([...cards.keys()].filter((i) => !yours(i) && isBot(i)));
    void (async () => {
      for (const i of order) {
        try {
          const r = await reviewCard(states[i]!, cards[i]!, ctx, solver, yours(i), isBot(i) ? recallDecision(states[i]!, ctx) : undefined);
          if (cancelled) return;
          setReviews((rs) => ({ ...rs, [i]: r }));
        } catch {
          if (!cancelled) setFailed(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [states, ctx]);

  const marked = (i: number) => reviews[i]?.mark ?? null;
  const inTrick = (t: number) => [...cards.keys()].filter((i) => trickOf(i) === t);
  const worstIn = (t: number) => MARK_ORDER.find((m) => inTrick(t).some((i) => yours(i) && marked(i) === m)) ?? null;
  /** The card to show first in a trick: your worst-marked card, else your card, else the lead. */
  const firstCard = (t: number) => {
    const all = inTrick(t);
    const worst = worstIn(t);
    return all.find((i) => yours(i) && worst && marked(i) === worst) ?? all.find(yours) ?? all[0] ?? 0;
  };

  const [trick, setTrick] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [details, setDetails] = useState(false);
  const at = picked !== null && trickOf(picked) === trick ? picked : firstCard(trick);

  const judged = [...cards.keys()].filter(yours);
  const done = judged.filter((i) => reviews[i]).length;
  const counts = MARK_ORDER.map((m) => [m, judged.filter((i) => marked(i) === m).length] as const).filter(([, n]) => n > 0);

  if (cards.length === 0) return <Typography color="text.secondary">No cards were played on this board.</Typography>;

  const trickCount = whole.tricks.filter((t) => t.cards.length > 0).length;
  // The hands when this trick started, and its cards.
  const start = replay(board.hands, trump, declarer, cards.slice(0, trick * 4));
  const theTrick = whole.tricks[trick]!;
  const winner = theTrick.cards.length === 4 ? trickWinner(theTrick, trump)?.seat : null;
  const place = (r: "partner" | "lho" | "rho" | "you") => SEATS.find((s) => relationTo(seat, s) === r)!;
  const AREA = { partner: "top", lho: "left", rho: "right", you: "bottom" } as const;

  const seatBox = (s: Seat) => (
    <Box key={s} sx={{ border: 1, borderColor: s === seat ? "primary.main" : "divider", borderRadius: 1, p: 1, minWidth: 0 }}>
      <Typography variant="caption" component="p" color="text.secondary" noWrap>
        {s === dummy ? "Dummy: " : ""}
        {SEAT_NAMES[s]} ({s === seat ? "you" : names[s]})
      </Typography>
      <Hand hand={start.hands[s]} trump={trump} />
    </Box>
  );

  const summary =
    judged.length === 0
      ? ""
      : done < judged.length
        ? ` Working out your cards (${done} of ${judged.length})…`
        : counts.length === 0
          ? " None of your cards is marked."
          : ` Your cards: ${counts.map(([m, n]) => (m === "mistake" ? `${n} ${n === 1 ? "mistake" : "mistakes"}` : m === "close" ? `${n} ${n === 1 ? "close call" : "close calls"}` : `${n} unlucky`)).join(", ")}.`;

  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        <ContractText contract={contract.contract} /> by {SEAT_NAMES[declarer]}
        {tricks !== null && `: ${tricks} ${tricks === 1 ? "trick" : "tricks"}`}
        {cards.length < 52 && ", after a claim"}.{summary} Tap a trick, then a card in it.
      </Typography>
      {!doubleDummy && (
        <Alert severity="info" sx={{ mb: 1 }}>
          The cards can't be judged on this device (it can't run the double-dummy solver), so this is the play only.
        </Alert>
      )}
      {failed && (
        <Alert severity="warning" sx={{ mb: 1 }}>
          Some cards couldn't be worked out.
        </Alert>
      )}

      {/* The tricks: tap one to go to it. A trick with a marked card of yours shows its worst mark. */}
      <Box role="group" aria-label="Tricks" sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, mb: 1 }}>
        {Array.from({ length: trickCount }, (_, k) => {
          const m = worstIn(k);
          return (
            <Button
              key={k}
              variant={k === trick ? "contained" : "outlined"}
              size="small"
              onClick={() => {
                setTrick(k);
                setPicked(null);
              }}
              aria-label={`Trick ${k + 1}${m ? `, ${PLAY_MARKS[m].name}` : ""}`}
              aria-pressed={k === trick}
              sx={{ minWidth: (th) => th.spacing(5.5), minHeight: (th) => th.spacing(5.5), px: 0.5 }}
            >
              {k + 1}
              {m && (
                <Box component="sup" aria-hidden sx={{ color: k === trick ? "inherit" : PLAY_MARKS[m].color, fontWeight: "fontWeightBold", ml: 0.25 }}>
                  {PLAY_MARKS[m].symbol}
                </Box>
              )}
            </Button>
          );
        })}
      </Box>

      <Stack spacing={1}>
        {seatBox(place("partner"))}
        <Box sx={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto minmax(0, 1fr)", gap: 1, alignItems: "center" }}>
          {seatBox(place("lho"))}
          <Box sx={{ textAlign: "center" }}>
            <Box
              role="group"
              aria-label={`Trick ${trick + 1}`}
              sx={{
                display: "grid",
                gridTemplateAreas: '". top ." "left middle right" ". bottom ."',
                gridTemplateColumns: (th) => `repeat(3, ${th.spacing(5)})`,
                gridTemplateRows: (th) => `repeat(3, ${th.spacing(7)})`,
                gap: 0.5,
                justifyContent: "center",
              }}
            >
              {theTrick.cards.map(({ seat: s, card }, k) => {
                const i = trick * 4 + k;
                const m = yours(i) ? marked(i) : null;
                return (
                  <ButtonBase
                    key={s}
                    onClick={() => setPicked(i)}
                    aria-pressed={i === at}
                    aria-label={`${SEAT_NAMES[s]}${k === 0 ? " led" : ""}: ${card.rank === "T" ? "10" : card.rank} of ${SUIT_NAMES[card.suit]}${m ? `, ${PLAY_MARKS[m].name}` : ""}. Show what it was`}
                    sx={{ gridArea: AREA[relationTo(seat, s)], borderRadius: 1, "&.Mui-focusVisible": { outline: (th) => `${th.spacing(0.25)} solid ${th.palette.primary.main}` } }}
                  >
                    <PlayingCard
                      card={card}
                      won={s === winner}
                      current={i === at}
                      label=""
                      note={k === 0 ? "led" : undefined}
                      badge={m && <MarkBadge mark={m} />}
                    />
                  </ButtonBase>
                );
              })}
            </Box>
            <Typography variant="caption" component="p" color="text.secondary" sx={{ mt: 0.5, maxWidth: (th) => th.spacing(17), mx: "auto" }}>
              Trick {trick + 1} · {SEAT_NAMES[theTrick.leader]} led
              {winner ? ` · ${SEAT_NAMES[winner]} won` : ""}
            </Typography>
          </Box>
          {seatBox(place("rho"))}
        </Box>
        {seatBox(place("you"))}
      </Stack>

      <Box sx={{ mt: 1.5 }}>
        <CardPanel
          card={cards[at]!}
          from={states[at] ? toPlay(states[at]) : seat}
          names={names}
          me={seat}
          chooser={chooser[at]!}
          isYours={yours(at)}
          isBot={isBot(at)}
          review={reviews[at]}
          canJudge={!!doubleDummy && !failed}
          onDetails={() => setDetails(true)}
        />
      </Box>
      {details && reviews[at] && (
        <DetailsDialog review={reviews[at]} card={cards[at]!} whose={chooser[at] === seat ? "your" : `${SEAT_NAMES[chooser[at]!]}'s`} onClose={() => setDetails(false)} />
      )}
    </Box>
  );
}

function MarkBadge({ mark }: { mark: PlayMark }) {
  return (
    <Box
      sx={{
        width: (t) => t.spacing(2.5),
        height: (t) => t.spacing(2.5),
        borderRadius: "50%",
        bgcolor: "background.paper",
        border: 1,
        borderColor: PLAY_MARKS[mark].color,
        color: PLAY_MARKS[mark].color,
        typography: "caption",
        fontWeight: "fontWeightBold",
        lineHeight: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {PLAY_MARKS[mark].symbol}
    </Box>
  );
}

/** What the card picked was, in a line or two: the verdict on yours, the reason for a bot's. */
function CardPanel({
  card,
  from,
  names,
  me,
  chooser,
  isYours,
  isBot,
  review: r,
  canJudge,
  onDetails,
}: {
  card: Card;
  /** The hand it came from. */
  from: Seat;
  names: Record<Seat, string>;
  me: Seat;
  /** Who chose it (declarer, for dummy's cards). */
  chooser: Seat;
  isYours: boolean;
  isBot: boolean;
  review: CardReview | undefined;
  canJudge: boolean;
  onDetails: () => void;
}) {
  const who = from === me ? "You" : chooser === me ? "You (from dummy)" : `${SEAT_NAMES[from]} (${names[from]})`;
  const text = (t: string) => <SuitString text={t} />;
  const heading = (
    <Typography variant="subtitle1" component="h3">
      {who} played {text(cardWords(card))}
    </Typography>
  );
  let body: React.ReactNode;
  if (!isYours && !isBot) {
    body = (
      <Typography variant="body2" color="text.secondary">
        Only your cards and the bots' are explained.
      </Typography>
    );
  } else if (!r) {
    body = (
      <Typography variant="body2" color="text.secondary">
        {canJudge ? "Working it out…" : "Not worked out on this device."}
      </Typography>
    );
  } else if (r.forced) {
    body = <Typography variant="body2">{r.actual.length === 0 ? "The only card that could be played." : "No real choice: every card did the same here."}</Typography>;
  } else if (!isYours) {
    body = <Typography variant="body2">{text(sentence(r.bot.reason))}</Typography>;
  } else {
    const yours = r.odds?.yours;
    const best = r.odds?.best;
    const fits = "of the deals that fitted what you could know";
    const onDeal = r.cost === 0 ? "On the actual deal it didn't cost a trick." : `On the actual deal it cost ${r.cost === 1 ? "a trick" : `${r.cost} tricks`}.`;
    const verdict =
      r.mark === "mistake" && best && yours
        ? { severity: "error" as const, title: "A mistake.", words: `${groupWords(best)} was best on ${pct(best.best)} ${fits}, ${cardWords(card)} on ${pct(yours.best)}. ${r.cost === 0 ? "It worked this time: on the actual deal it didn't cost a trick." : onDeal}` }
        : r.mark === "close" && best && yours
          ? { severity: "warning" as const, title: "A close call.", words: `${groupWords(best)} was a little better: best on ${pct(best.best)} ${fits}, ${cardWords(card)} on ${pct(yours.best)}. ${onDeal}` }
          : r.mark === "unlucky"
            ? { severity: "info" as const, title: "Unlucky.", words: `The right card on the odds${yours ? ` (best on ${pct(yours.best)} ${fits})` : ""}, but on the actual deal ${cardWords(r.actual[0]!.card)} would have taken ${r.cost === 1 ? "a trick" : `${r.cost} tricks`} more.` }
            : r.tooClose && best && yours
              ? { severity: "info" as const, title: "Too close to call.", words: `${groupWords(best)} best on ${pct(best.best)} ${fits}, ${cardWords(card)} on ${pct(yours.best)}. ${onDeal}` }
              : { severity: "success" as const, title: "A good card.", words: `${yours ? `Best on ${pct(yours.best)} ${fits}. ` : ""}${onDeal}` };
    // The bot's choice, only when the verdict doesn't already name it.
    const named = [...(best?.cards ?? []), ...(yours?.cards ?? [])].some((c) => cardCode(c) === cardCode(r.bot.card));
    body = (
      <>
        <Alert severity={verdict.severity}>
          <strong>{verdict.title}</strong> {text(verdict.words)}
        </Alert>
        {!named && (
          <Typography variant="body2" sx={{ mt: 0.5 }}>
            The bot would have played {text(cardWords(r.bot.card))}.
          </Typography>
        )}
      </>
    );
  }
  return (
    <Box aria-live="polite">
      <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 0.5 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>{heading}</Box>
        {r && !r.forced && (isYours || isBot) && (
          <Button variant="outlined" size="small" onClick={onDetails}>
            Details
          </Button>
        )}
      </Stack>
      {body}
    </Box>
  );
}

/** The figures behind a card's verdict: each card's share of the deals, and its tricks on the actual deal. */
function DetailsDialog({ review: r, card, whose, onClose }: { review: CardReview; card: Card; whose: string; onClose: () => void }) {
  return (
    <SheetDialog
      open
      onClose={onClose}
      title={<>Details: <SuitString text={cardWords(card)} /></>}
      actions={<Button onClick={onClose}>Close</Button>}
    >
      <Stack spacing={2}>
        {r.odds && (
          <Box>
            <Typography variant="subtitle2" component="h3" color="text.secondary">
              From {whose} seat
            </Typography>
            <Typography variant="body2" sx={{ mb: 0.5 }}>
              {r.odds.deals} deals of the hidden hands that fitted the bidding and the cards played so far. For each card: how often it
              was the best card, and the tricks it took on average, with perfect play from here.
            </Typography>
            <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
              {r.odds.groups.slice(0, 6).map((g) => (
                <li key={groupWords(g)}>
                  <Typography variant="body2">
                    <SuitString text={groupWords(g)} />: best on {pct(g.best)}, {g.average.toFixed(1)} tricks
                  </Typography>
                </li>
              ))}
            </Box>
          </Box>
        )}
        {r.actual.length > 0 && (
          <Box>
            <Typography variant="subtitle2" component="h3" color="text.secondary">
              On the actual deal
            </Typography>
            <Typography variant="body2" sx={{ mb: 0.5 }}>
              The tricks each card would have taken from here, with everyone playing perfectly.
            </Typography>
            <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
              {byTricks(r.actual).map(([n, cs]) => (
                <li key={n}>
                  <Typography variant="body2">
                    {n} {n === 1 ? "trick" : "tricks"}: <SuitString text={cs.map(cardWords).join(" ")} />
                  </Typography>
                </li>
              ))}
            </Box>
          </Box>
        )}
        <Box>
          <Typography variant="subtitle2" component="h3" color="text.secondary">
            The bot's choice
          </Typography>
          <Typography variant="body2">
            <SuitString text={`${cardWords(r.bot.card)}: ${r.bot.reason}.`} />
          </Typography>
        </Box>
      </Stack>
    </SheetDialog>
  );
}

/** Cards grouped by the tricks they take, most first. */
function byTricks(actual: { card: Card; tricks: number }[]): [number, Card[]][] {
  const m = new Map<number, Card[]>();
  for (const a of actual) m.set(a.tricks, [...(m.get(a.tricks) ?? []), a.card]);
  return [...m.entries()].sort((a, b) => b[0] - a[0]);
}

/** "the only card" → "The only card." */
const sentence = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) + (/[.!?]$/.test(s) ? "" : ".") : s);

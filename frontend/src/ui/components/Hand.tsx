import { Box, ButtonBase, Typography } from "@mui/material";
import { useEffect, useState } from "react";
import type { Card } from "../../core/play";
import { type Hand as HandT, type Strain, type Suit, SUIT_SYMBOLS, SUITS } from "../../core/types";
import { StrainSymbol, SUIT_NAMES } from "../controls/BridgeText";
import { handSuitOrder } from "../labels";

/** "AKT4" → "A K 10 4" */
function ranks(suit: string): string {
  return [...suit].map((r) => (r === "T" ? "10" : r)).join(" ");
}

const RANK_NAMES: Record<string, string> = { A: "ace", K: "king", Q: "queen", J: "jack", T: "10" };

/** How much wider than its visible strip each card is: the last card shows in full. */
const CARD_WIDTH = 2.4;
/** How far a picked card lifts, in strips: enough to show its whole width above the fan. */
const LIFT = 1.2;

interface TilesProps {
  hand: HandT;
  trump: Strain | null;
  /** Names the fan for screen readers. */
  label?: string;
  /** A shorter fan (for dummy): the corner index stays full size, less card shows below it. */
  short?: boolean;
  /**
   * Makes the cards playable: tap a card to pick it (it lifts), tap it again to play it. Cards
   * `canPlay` rejects are greyed out; tapping one calls `onBlocked` (to say why).
   */
  play?: {
    canPlay: (card: Card) => boolean;
    onPlay: (card: Card) => void;
    onBlocked?: (card: Card) => void;
    /** A card already picked for you (your only legal card), so one tap plays it. */
    preselect?: Card | null;
  };
  /**
   * During card play: sized for a full 13 cards, centred, and always with room above for a picked
   * card to lift, so the fan keeps its size as cards are played and as turns come and go.
   */
  inPlay?: boolean;
}

/**
 * One hand as a fan of overlapping playing cards, sorted by suit (trumps first) then rank. Each
 * card shows its rank over its suit in the top-left corner, as real cards do, and the last card
 * shows in full.
 *
 * Every size is a multiple of one "strip" (the visible part of each card), worked out from the
 * row's width with container query units, so the cards fill the row exactly on any screen and the
 * corner index is as big as the strip allows. That's why the sizes here are ratios, not theme units.
 *
 * When playable, a picked card lifts without coming to the front: its full width shows above the
 * fan for the second tap, and the cards beside it stay where they were, so a tap meant for a
 * neighbour can't play it.
 */
export function HandTiles({ hand, trump, label = "Your cards", short = false, play, inPlay = false }: TilesProps) {
  const [picked, setPicked] = useState<string | null>(null);
  const cards = handSuitOrder(trump).flatMap((s) => [...hand[s]].map((r) => ({ suit: s, rank: r })));
  const strip = (k: number) => `calc(var(--strip) * ${k})`;
  const cardHeight = CARD_WIDTH * (short ? 0.9 : 1.4);
  const faceSx = (suit: Suit) => ({
    display: "block",
    position: "relative",
    width: 1,
    height: strip(cardHeight),
    bgcolor: "card.face",
    border: 1,
    borderColor: "card.edge",
    borderRadius: strip(0.18),
    boxShadow: 1,
    color: suit === "H" || suit === "D" ? "card.red" : "card.ink",
    lineHeight: 1,
    textAlign: "left",
  }) as const;

  // A pick only lasts while it's your turn.
  useEffect(() => {
    if (!play) setPicked(null);
  }, [!play]);
  const preselected = play?.preselect ? play.preselect.suit + play.preselect.rank : null;
  useEffect(() => {
    if (preselected) setPicked(preselected);
  }, [preselected]);

  function tap(card: Card) {
    if (!play) return;
    if (!play.canPlay(card)) {
      setPicked(null);
      play.onBlocked?.(card);
    } else if (picked === card.suit + card.rank) {
      setPicked(null);
      play.onPlay(card);
    } else setPicked(card.suit + card.rank);
  }

  return (
    <Box sx={{ containerType: "inline-size" }}>
      <Box
        role="list"
        aria-label={label}
        sx={{
          "--strip": `calc(100cqi / ${Math.max(1, (inPlay ? 13 : cards.length) - 1 + CARD_WIDTH)})`,
          display: "flex",
          justifyContent: inPlay ? "center" : undefined,
          pt: play || inPlay ? strip(LIFT) : 0,
          // Room for one card even when the hand is empty.
          minHeight: inPlay ? strip(LIFT + cardHeight) : undefined,
        }}
      >
        {cards.map((card, i) => {
          const { suit, rank } = card;
          const name = `${RANK_NAMES[rank] ?? rank} of ${SUIT_NAMES[suit]}`;
          const isPicked = !!play && picked === suit + rank;
          const blocked = !!play && !play.canPlay(card);
          const face = (
            <>
              {/* The corner index: rank over suit, tight in the visible strip. */}
              <Box
                aria-hidden
                sx={{ position: "absolute", top: strip(0.1), left: strip(0.08), fontSize: strip(0.82), textAlign: "center" }}
              >
                <Box sx={{ fontWeight: "fontWeightBold", letterSpacing: rank === "T" ? "-0.12em" : undefined }}>
                  {rank === "T" ? "10" : rank}
                </Box>
                <Box>{SUIT_SYMBOLS[suit]}</Box>
              </Box>
              {/* A big suit at the bottom right: only the last card shows it, the rest are covered. */}
              {!short && (
                <Box aria-hidden sx={{ position: "absolute", right: strip(0.2), bottom: strip(0.15), fontSize: strip(1.5) }}>
                  {SUIT_SYMBOLS[suit]}
                </Box>
              )}
            </>
          );
          return (
            <Box
              key={suit + rank}
              role="listitem"
              aria-label={play ? undefined : name}
              sx={{ flexShrink: 0, width: strip(CARD_WIDTH), ml: i === 0 ? 0 : strip(1 - CARD_WIDTH) }}
            >
              {play ? (
                <ButtonBase
                  onClick={() => tap(card)}
                  aria-label={isPicked ? `${name}, picked. Tap again to play it` : blocked ? `${name}, can't be played now` : name}
                  sx={{
                    ...faceSx(suit),
                    borderColor: isPicked ? "primary.main" : "card.edge",
                    boxShadow: isPicked ? 4 : 1,
                    transform: isPicked ? `translateY(${strip(-LIFT)})` : undefined,
                    transition: (t) => t.transitions.create("transform", { duration: t.transitions.duration.shortest }),
                    "&.Mui-focusVisible": { outline: (t) => `${t.spacing(0.25)} solid ${t.palette.primary.main}`, zIndex: 1 },
                    // Greyed out, still tappable (to say why it can't be played).
                    ...(blocked && { "& > *": { opacity: (t) => t.palette.action.disabledOpacity } }),
                  }}
                >
                  {face}
                </ButtonBase>
              ) : (
                <Box sx={faceSx(suit)}>{face}</Box>
              )}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

/** One hand, a suit per row. `large` is for reading at arm's length while sorting real cards. */
export function Hand({ hand, large = false }: { hand: HandT; large?: boolean }) {
  return (
    <Box sx={{ display: "grid", gap: large ? 0.5 : 0 }}>
      {SUITS.map((s) => (
        <Typography key={s} variant={large ? "h4" : "body1"} component="div" sx={{ display: "flex", gap: large ? 2 : 0.75 }}>
          <StrainSymbol strain={s} />
          <Box component="span" sx={{ fontWeight: "fontWeightBold" }}>
            {hand[s].length === 0 ? (
              <Box component="span" sx={{ color: "text.secondary", fontWeight: "fontWeightRegular", fontStyle: "italic" }}>
                void
              </Box>
            ) : (
              ranks(hand[s])
            )}
          </Box>
        </Typography>
      ))}
    </Box>
  );
}

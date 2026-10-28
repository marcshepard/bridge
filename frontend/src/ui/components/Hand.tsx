import { Box, Typography } from "@mui/material";
import { type Hand as HandT, type Strain, SUIT_SYMBOLS, SUITS } from "../../core/types";
import { StrainSymbol, SUIT_NAMES } from "../controls/BridgeText";
import { handSuitOrder } from "../labels";

/** "AKT4" → "A K 10 4" */
function ranks(suit: string): string {
  return [...suit].map((r) => (r === "T" ? "10" : r)).join(" ");
}

const RANK_NAMES: Record<string, string> = { A: "ace", K: "king", Q: "queen", J: "jack", T: "10" };

/** How much wider than its visible strip each card is: the last card shows in full. */
const CARD_WIDTH = 2.4;

/**
 * One hand as a fan of overlapping playing cards, sorted by suit (trumps first) then rank. Each
 * card shows its rank over its suit in the top-left corner, as real cards do, and the last card
 * shows in full.
 *
 * Every size is a multiple of one "strip" (the visible part of each card), worked out from the
 * row's width with container query units, so the cards fill the row exactly on any screen and the
 * corner index is as big as the strip allows. That's why the sizes here are ratios, not theme units.
 */
export function HandTiles({ hand, trump }: { hand: HandT; trump: Strain | null }) {
  const cards = handSuitOrder(trump).flatMap((s) => [...hand[s]].map((r) => ({ suit: s, rank: r })));
  const strip = (k: number) => `calc(var(--strip) * ${k})`;
  return (
    <Box sx={{ containerType: "inline-size" }}>
      <Box
        role="list"
        aria-label="Your cards"
        sx={{
          "--strip": `calc(100cqi / ${Math.max(1, cards.length - 1 + CARD_WIDTH)})`,
          display: "flex",
        }}
      >
        {cards.map(({ suit, rank }, i) => (
          <Box
            key={suit + rank}
            role="listitem"
            aria-label={`${RANK_NAMES[rank] ?? rank} of ${SUIT_NAMES[suit]}`}
            sx={{
              position: "relative",
              flexShrink: 0,
              width: strip(CARD_WIDTH),
              height: strip(CARD_WIDTH * 1.4),
              ml: i === 0 ? 0 : strip(1 - CARD_WIDTH),
              bgcolor: "card.face",
              border: 1,
              borderColor: "card.edge",
              borderRadius: strip(0.18),
              boxShadow: 1,
              color: suit === "H" || suit === "D" ? "card.red" : "card.ink",
              lineHeight: 1,
            }}
          >
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
            <Box aria-hidden sx={{ position: "absolute", right: strip(0.2), bottom: strip(0.15), fontSize: strip(1.5) }}>
              {SUIT_SYMBOLS[suit]}
            </Box>
          </Box>
        ))}
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

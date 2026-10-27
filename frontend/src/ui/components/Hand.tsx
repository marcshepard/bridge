import { Box, Typography } from "@mui/material";
import { hcp } from "../../core/deal";
import { type Hand as HandT, type Seat, SEAT_NAMES, SUITS } from "../../core/types";
import { StrainSymbol } from "../controls/BridgeText";

/** "AKT4" → "A K 10 4" */
function ranks(suit: string): string {
  return [...suit].map((r) => (r === "T" ? "10" : r)).join(" ");
}

/** One hand, a suit per row. `large` is for reading at arm's length while sorting real cards. */
export function Hand({ hand, large = false }: { hand: HandT; large?: boolean }) {
  return (
    <Box sx={{ display: "grid", gap: large ? 0.5 : 0 }}>
      {SUITS.map((s) => (
        <Typography key={s} variant={large ? "h4" : "body2"} component="div" sx={{ display: "flex", gap: large ? 2 : 1 }}>
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

const AREA: Record<Seat, string> = { N: "n", E: "e", S: "s", W: "w" };

/** All four hands in the usual compass layout, for reviewing a board after it's played. */
export function FullDeal({ hands, you }: { hands: Record<Seat, HandT>; you: Seat }) {
  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateAreas: '". n ." "w c e" ". s ."',
        gridTemplateColumns: "1fr auto 1fr",
        gap: 1.5,
      }}
    >
      {(["N", "W", "E", "S"] as const).map((s) => (
        <Box key={s} sx={{ gridArea: AREA[s] }}>
          <Typography variant="subtitle2">
            {SEAT_NAMES[s]}
            {s === you ? " (you)" : ""}{" "}
            <Typography component="span" variant="body2" color="text.secondary">
              {hcp(hands[s])} HCP
            </Typography>
          </Typography>
          <Hand hand={hands[s]} />
        </Box>
      ))}
      <Typography
        aria-hidden
        variant="caption"
        color="text.secondary"
        sx={{ gridArea: "c", alignSelf: "center", textAlign: "center" }}
      >
        N<br />W ✢ E<br />S
      </Typography>
    </Box>
  );
}

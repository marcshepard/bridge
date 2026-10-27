// A drawing of a physical duplicate board: the four seats round the edge, the vulnerable sides
// marked in the theme's error colour (red on a real board), the dealer marked — the way players
// already read this information at the table. Sizes are theme spacing units.

import { Box, Typography } from "@mui/material";
import { type Seat, type Vulnerability, SEAT_NAMES } from "../../core/types";

interface Props {
  number: number;
  dealer: Seat;
  vul: Vulnerability;
  you: Seat;
}

const SIDE = 4.5; // spacing units

function place(s: Seat) {
  const side = (t: { spacing: (n: number) => string }) => t.spacing(SIDE);
  switch (s) {
    case "N":
      return { top: 0, left: 0, right: 0, height: side };
    case "S":
      return { bottom: 0, left: 0, right: 0, height: side };
    case "W":
      return { left: 0, top: side, bottom: side, width: side, flexDirection: "column" as const };
    case "E":
      return { right: 0, top: side, bottom: side, width: side, flexDirection: "column" as const };
  }
}

function Tag({ children, kind, vertical }: { children: string; kind: "dealer" | "you"; vertical: boolean }) {
  return (
    <Typography
      variant="caption"
      component="span"
      sx={{
        lineHeight: 1,
        px: vertical ? 0.25 : 0.5,
        py: vertical ? 0.5 : 0.25,
        borderRadius: 0.5,
        writingMode: vertical ? "vertical-rl" : undefined,
        ...(kind === "dealer"
          ? { bgcolor: "text.primary", color: "background.paper" }
          : { bgcolor: "primary.main", color: "primary.contrastText" }),
      }}
    >
      {children}
    </Typography>
  );
}

export function DuplicateBoard({ number, dealer, vul, you }: Props) {
  const isVul = (s: Seat) =>
    vul === "Both" || (vul === "NS" && (s === "N" || s === "S")) || (vul === "EW" && (s === "E" || s === "W"));

  return (
    <Box
      component="figure"
      aria-label={`Board ${number}. Dealer ${SEAT_NAMES[dealer]}. Vulnerable: ${vul}.`}
      sx={{
        position: "relative",
        width: (t) => t.spacing(27),
        maxWidth: "70%",
        aspectRatio: "1",
        mx: "auto",
        my: 0,
        border: 2,
        borderColor: "text.primary",
        borderRadius: 2,
        bgcolor: "background.paper",
        overflow: "hidden",
      }}
    >
      {(["N", "E", "S", "W"] as const).map((s) => {
        const vertical = s === "E" || s === "W";
        return (
          <Box
            key={s}
            sx={{
              position: "absolute",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: vertical ? 0.25 : 0.5,
              ...(isVul(s)
                ? { bgcolor: "error.main", color: "error.contrastText" }
                : { bgcolor: "action.hover", color: "text.primary" }),
              ...place(s),
            }}
          >
            <Typography variant="subtitle1" component="span" sx={{ fontWeight: "fontWeightBold", lineHeight: 1 }}>
              {s}
            </Typography>
            {s === dealer && (
              <Tag kind="dealer" vertical={vertical}>
                Dealer
              </Tag>
            )}
            {s === you && (
              <Tag kind="you" vertical={vertical}>
                You
              </Tag>
            )}
          </Box>
        );
      })}
      <Box
        sx={{
          position: "absolute",
          inset: (t) => t.spacing(SIDE),
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Typography variant="body2" color="text.secondary">
          Board
        </Typography>
        <Typography variant="h3" component="p">
          {number}
        </Typography>
      </Box>
    </Box>
  );
}

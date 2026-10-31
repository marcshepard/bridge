// The top of the board screen and the result screen: one line for which game and board this is
// (with an ⓘ for the board details), then the setup (your seat, the dealer, who's vulnerable).
//
// Before the result the setup is what you need to deal and bid, so it stands out: a line each, in
// bigger type, labels lined up in a column beside a primary-colour rule (`stacked`). On the result
// screen the hands need the room, so it's one small line ("Dealer East (Joe, on your right) ·
// Vulnerable N/S (you)").

import InfoIcon from "@mui/icons-material/InfoOutlined";
import { Box, IconButton, Typography } from "@mui/material";
import { Fragment, type ReactNode } from "react";

interface Props {
  /** The game's title: "The Common Game 10/16/26". */
  title: string;
  /** The original game's board number. */
  board: number;
  /** The setup, label and value: ["Dealer", "East (Joe, on your right)"]. */
  rows: [string, ReactNode][];
  /** A line each, in bigger type (the board screen), rather than one small line. */
  stacked?: boolean;
  onInfo: () => void;
}

export function BoardHeader({ title, board, rows, stacked = false, onInfo }: Props) {
  return (
    <Box sx={{ mb: stacked ? 2.5 : 1.5 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
        <Typography variant="subtitle1" component="h1" noWrap sx={{ flex: 1, minWidth: 0 }}>
          Board {board}
          <Box component="span" sx={{ color: "text.secondary", typography: "body2" }}>
            {" "}
            · {title}
          </Box>
        </Typography>
        {/* A 44px tap target that doesn't make the line taller than its text. */}
        <IconButton aria-label="Board details" onClick={onInfo} sx={{ p: 1.5, my: -1.5, mr: -1.5, color: "text.secondary" }}>
          <InfoIcon fontSize="small" />
        </IconButton>
      </Box>
      {stacked ? (
        <Box
          component="dl"
          sx={{
            m: 0,
            mt: 1.5,
            pl: 1.5,
            borderLeft: 3,
            borderColor: "primary.main",
            display: "grid",
            gridTemplateColumns: "auto 1fr",
            columnGap: 2,
            rowGap: 0.5,
            alignItems: "baseline",
          }}
        >
          {rows.map(([label, value]) => (
            <Box key={label} sx={{ display: "contents" }}>
              <Typography component="dt" variant="body1" color="text.secondary">
                {label}
              </Typography>
              <Typography component="dd" variant="h6" sx={{ m: 0, minWidth: 0, lineHeight: 1.4 }}>
                {value}
              </Typography>
            </Box>
          ))}
        </Box>
      ) : (
        <Typography variant="body2" color="text.secondary">
          {rows.map(([label, value], i) => (
            <Fragment key={label}>
              {i > 0 && " · "}
              {label}{" "}
              <Box component="span" sx={{ color: "text.primary", fontWeight: "fontWeightMedium" }}>
                {value}
              </Box>
            </Fragment>
          ))}
        </Typography>
      )}
    </Box>
  );
}

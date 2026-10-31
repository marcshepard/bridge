// A figure you can tap to see what's behind it: a small label over the value, with a chevron, in
// an outlined button so it plainly looks tappable. Used for a board's score (opens the breakdown)
// and matchpoints (opens the field), side by side. Compact, so the result screen fits a phone.

import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import { Box, Button, Typography } from "@mui/material";
import type { ReactNode } from "react";

interface Props {
  /** What the figure is: "Score", "Matchpoints". */
  label: string;
  /** The figure itself: "+180 N/S". */
  children: ReactNode;
  onClick: () => void;
  /** Says what tapping does, for screen readers: "+180 N/S. Show the score breakdown". */
  ariaLabel: string;
}

export function DetailButton({ label, children, onClick, ariaLabel }: Props) {
  return (
    <Button
      variant="outlined"
      fullWidth
      onClick={onClick}
      aria-label={ariaLabel}
      endIcon={<ChevronRightIcon />}
      sx={{ justifyContent: "space-between", textAlign: "left", py: 0.5, px: 1.5, color: "text.primary" }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="caption" component="p" color="text.secondary" sx={{ lineHeight: 1.3 }}>
          {label}
        </Typography>
        <Typography variant="subtitle1" component="p" className="num" sx={{ fontWeight: "fontWeightBold", lineHeight: 1.3 }}>
          {children}
        </Typography>
      </Box>
    </Button>
  );
}

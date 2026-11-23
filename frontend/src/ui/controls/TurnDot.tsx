// The small pulsing dot that marks whose turn it is: beside "Your turn" at the top of a board played
// online, and on the title of the seat box that plays next. One dot, one meaning, everywhere.

import { Box } from "@mui/material";
import { keyframes } from "@mui/material/styles";

/** The dot swells and fades. */
const pulse = keyframes`
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.35; transform: scale(0.6); }
`;

export function TurnDot() {
  return (
    <Box
      component="span"
      aria-hidden
      sx={(t) => ({
        display: "inline-block",
        flexShrink: 0,
        width: t.spacing(1.25),
        height: t.spacing(1.25),
        borderRadius: "50%",
        bgcolor: "primary.main",
        animation: `${pulse} 1.2s ease-in-out infinite`,
        "@media (prefers-reduced-motion: reduce)": { animation: "none" },
      })}
    />
  );
}

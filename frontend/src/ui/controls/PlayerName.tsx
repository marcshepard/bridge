// A player's name, greyed out with a small no-signal icon while their device isn't connected
// ("away"). The icon takes about a letter's width, where "(away)" took six, and says the same thing
// to people who can't tell the grey from the normal text colour. Tap it (or hover, or focus it) to
// see what it means; screen readers hear "Carol, away".

import CloudOffIcon from "@mui/icons-material/CloudOff";
import { Box, Tooltip } from "@mui/material";

export function PlayerName({ name, away, suffix = "" }: { name: string; away: boolean; suffix?: string }) {
  return (
    <Box component="span" sx={away ? { color: "text.disabled" } : undefined}>
      {name}
      {suffix}
      {away && (
        // Opens on a tap straight away (a tooltip normally needs a long press on touch screens).
        <Tooltip title="Away: not connected right now" enterTouchDelay={0} leaveTouchDelay={3000} arrow>
          <Box
            component="span"
            role="img"
            aria-label="away"
            tabIndex={0}
            sx={{ ml: 0.5, display: "inline-flex", verticalAlign: "middle", cursor: "help" }}
          >
            <CloudOffIcon fontSize="inherit" />
          </Box>
        </Tooltip>
      )}
    </Box>
  );
}

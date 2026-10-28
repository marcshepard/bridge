// Shown under the header while this device's live connection to the game is down (a phone asleep,
// Wi-Fi dropping). It reconnects on its own, then catches up on anything it missed.

import { Alert, CircularProgress } from "@mui/material";

export function ReconnectingBanner() {
  return (
    <Alert
      severity="info"
      square
      role="status"
      icon={<CircularProgress size="1em" color="inherit" />}
      sx={{ justifyContent: "center", alignItems: "center", "& .MuiAlert-message": { textAlign: "center" } }}
    >
      Reconnecting… You'll catch up on anything you missed as soon as it's back.
    </Alert>
  );
}

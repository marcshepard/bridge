// Telling the table about something that happened on someone else's device ("Ann corrected board
// 3", "Dana has replaced Joe"). A bar at the bottom of the screen (a "snackbar") that doesn't block
// what you're doing and goes away by itself after a few seconds, or when closed. Use it for every
// such message.

import CloseIcon from "@mui/icons-material/Close";
import { Alert, Button, IconButton, Snackbar } from "@mui/material";
import type { ReactNode } from "react";

const AUTO_HIDE_MS = 6_000;

export interface NoticeMessage {
  /** Changes for each new message, so a repeat of the same text still shows afresh. */
  key: string | number;
  text: ReactNode;
  /** An optional follow-up, e.g. "Show board". */
  action?: { label: string; onClick: () => void };
  /** "warning" for something you need to do (default "info": news). */
  severity?: "info" | "warning";
  /** Stays until closed (or until the message is taken away), instead of going after a few seconds. */
  persistent?: boolean;
}

interface Props {
  notice: NoticeMessage | null;
  onClose: () => void;
}

export function Notice({ notice, onClose }: Props) {
  return (
    <Snackbar
      key={notice?.key}
      open={notice !== null}
      // Long enough to read twice; the timer pauses while it's touched, hovered or focused.
      autoHideDuration={notice?.persistent ? null : AUTO_HIDE_MS}
      onClose={(_, reason) => {
        // Taps elsewhere on the screen don't dismiss it early.
        if (reason !== "clickaway") onClose();
      }}
      anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
    >
      <Alert
        severity={notice?.severity ?? "info"}
        variant="filled"
        // An Alert drops its own close button when given an action, so both are here.
        action={
          <>
            {notice?.action && (
              <Button
                color="inherit"
                onClick={() => {
                  notice.action!.onClick();
                  onClose();
                }}
              >
                {notice.action.label}
              </Button>
            )}
            <IconButton color="inherit" aria-label="Close" onClick={onClose}>
              <CloseIcon />
            </IconButton>
          </>
        }
        sx={{ width: "100%", alignItems: "center" }}
      >
        {notice?.text}
      </Alert>
    </Snackbar>
  );
}

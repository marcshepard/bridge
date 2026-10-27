// "Install to home screen" on phones and tablets, shown under the header until the app is installed
// (or dismissed for this visit). Tapping anywhere on it opens a dialog that installs it, or explains how.

import { Alert, Box, Button, ButtonBase, Typography } from "@mui/material";
import { useState } from "react";
import { SheetDialog } from "../controls/SheetDialog";
import { useInstall } from "../install";

export function InstallBanner() {
  const install = useInstall();
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(false);

  if ((!install.suggest && !install.installed) || hidden) return null;

  const close = () => {
    setOpen(false);
    if (install.installed) setHidden(true);
  };

  return (
    <>
      {!install.installed && (
        // The whole banner is the button.
        <ButtonBase onClick={() => setOpen(true)} sx={{ display: "block", width: "100%" }}>
          <Alert
            severity="warning"
            variant="filled"
            square
            // Gold (the theme's secondary colour): stands out from the page and sits well with the green header.
            sx={{
              justifyContent: "center",
              alignItems: "center",
              bgcolor: "secondary.main",
              color: "secondary.contrastText",
              "& .MuiAlert-icon": { color: "inherit" },
              "& .MuiAlert-message": { textAlign: "center" },
            }}
          >
            Install to home screen for the best experience
          </Alert>
        </ButtonBase>
      )}

      <SheetDialog
        open={open || install.installed}
        title={install.installed ? "Bridge Replay is installed" : "Install Bridge Replay"}
        onClose={close}
        actions={
          install.installed ? (
            <Button variant="contained" onClick={close}>
              Done
            </Button>
          ) : install.canPrompt ? (
            <>
              <Button
                color="inherit"
                onClick={() => {
                  setOpen(false);
                  setHidden(true);
                }}
              >
                Not now
              </Button>
              <Button variant="contained" size="large" onClick={() => void install.prompt()}>
                Install
              </Button>
            </>
          ) : (
            <Button
              color="inherit"
              onClick={() => {
                setOpen(false);
                setHidden(true);
              }}
            >
              Not now
            </Button>
          )
        }
      >
        {install.installed ? (
          <Typography>
            Open Bridge Replay from its icon on your home screen. You can close this browser tab: the installed app
            picks up where you left off.
          </Typography>
        ) : (
          <>
            <Typography sx={{ mb: 2 }}>
              Installed, Bridge Replay opens full screen from its own icon, like any other app, with no browser
              address bar in the way.
            </Typography>
            {install.canPrompt ? (
              <Typography>Tap Install, then confirm.</Typography>
            ) : install.platform === "ios" ? (
              <Box component="ol" sx={{ m: 0, pl: 2.5, display: "grid", gap: 0.5 }}>
                <li>
                  Tap the <strong>Share</strong> button (the square with an arrow pointing up).
                </li>
                <li>
                  Scroll down and tap <strong>Add to Home Screen</strong>, then <strong>Add</strong>.
                </li>
                <li>Open Bridge Replay from its new icon on your home screen.</li>
              </Box>
            ) : (
              <Box component="ol" sx={{ m: 0, pl: 2.5, display: "grid", gap: 0.5 }}>
                <li>
                  Tap your browser's <strong>⋮</strong> menu.
                </li>
                <li>
                  Tap <strong>Install app</strong> (or <strong>Add to Home screen</strong>). If it says{" "}
                  <strong>Open app</strong> instead, it's already installed: open it from your home screen.
                </li>
              </Box>
            )}
          </>
        )}
      </SheetDialog>
    </>
  );
}

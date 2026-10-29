// "Install to home screen" on phones and tablets, shown under the header until the app is installed
// (or dismissed for this visit). Tapping anywhere on it opens a dialog that installs it, or explains how.
// On a computer (dev builds show it there too) the banner has a close button, and once closed it
// stays closed on that browser (remembered in the profile). The avatar menu's
// "Install to home screen" opens the same dialog (`open`), on any device.

import CloseIcon from "@mui/icons-material/Close";
import { Alert, Box, Button, ButtonBase, IconButton, Typography } from "@mui/material";
import { useState } from "react";
import { profile } from "../../services";
import { SheetDialog } from "../controls/SheetDialog";
import { useInstall } from "../install";

interface Props {
  /** The install dialog is open (from the banner or the avatar menu). */
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
}

export function InstallBanner({ open, onOpen, onClose }: Props) {
  const install = useInstall();
  // Closed on a computer before, or "Not now" this visit.
  const [hidden, setHidden] = useState(() => !install.touch && profile.installBannerClosed());
  // Once installed, the "it's installed" dialog shows once.
  const [doneShown, setDoneShown] = useState(false);

  const close = () => {
    onClose();
    if (install.installed) setDoneShown(true);
  };
  const notNow = () => {
    onClose();
    setHidden(true);
  };
  const showBanner = install.suggest && !hidden;

  return (
    <>
      {showBanner && (
        <Box sx={{ position: "relative" }}>
          {/* The whole banner is the button. */}
          <ButtonBase onClick={onOpen} sx={{ display: "block", width: "100%" }}>
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
                // Room for the close button, so the text stays centred clear of it.
                ...(!install.touch && { px: 7 }),
              }}
            >
              Install to home screen for the best experience
            </Alert>
          </ButtonBase>
          {/* On a computer it can be closed; outside the banner's button, so closing doesn't open the dialog. */}
          {!install.touch && (
            <IconButton
              aria-label="Close the install banner"
              onClick={() => {
                profile.setInstallBannerClosed();
                setHidden(true);
              }}
              sx={{
                position: "absolute",
                right: (t) => t.spacing(1),
                top: "50%",
                transform: "translateY(-50%)",
                color: "secondary.contrastText",
              }}
            >
              <CloseIcon />
            </IconButton>
          )}
        </Box>
      )}

      <SheetDialog
        open={(open && install.canInstall) || (install.installed && !doneShown)}
        title={install.installed ? "Bridge Replay is installed" : "Install Bridge Replay"}
        onClose={close}
        actions={
          install.installed ? (
            <Button variant="contained" onClick={close}>
              Done
            </Button>
          ) : install.canPrompt ? (
            <>
              <Button color="inherit" onClick={notNow}>
                Not now
              </Button>
              <Button variant="contained" size="large" onClick={() => void install.prompt()}>
                Install
              </Button>
            </>
          ) : (
            <Button color="inherit" onClick={notNow}>
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
            ) : !install.touch ? (
              <Box component="ol" sx={{ m: 0, pl: 2.5, display: "grid", gap: 0.5 }}>
                <li>
                  In Chrome or Edge, click the install icon at the right of the address bar (or find{" "}
                  <strong>Install</strong> in the browser's menu).
                </li>
                <li>
                  On a Mac in Safari, choose <strong>File</strong>, then <strong>Add to Dock</strong>. Firefox can't
                  install it.
                </li>
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

// The bar at the top of every screen: app icon and name, help, and your avatar. The avatar menu
// holds the Dark mode switch, "Leave game", and "Install to home screen" until the app is installed.
// While this device's live connection to the game is down, a small no-signal icon ("Reconnecting")
// sits beside Help: in the bar, so it never moves the page or covers anything.

import CloudOffIcon from "@mui/icons-material/CloudOff";
import HelpOutlineIcon from "@mui/icons-material/HelpOutlineOutlined";
import {
  AppBar,
  Avatar,
  Box,
  Divider,
  IconButton,
  ListItemText,
  Menu,
  MenuItem,
  Switch,
  Toolbar,
  Tooltip,
  Typography,
  useColorScheme,
} from "@mui/material";
import { useEffect, useId, useState } from "react";

interface Props {
  name: string;
  onHelp: () => void;
  /** Present only while you're in a game. */
  onLeaveGame?: () => void;
  /** Present only while the app isn't installed (it's in a browser tab). */
  onInstall?: () => void;
  /** This device's live connection to the game has been down for a few seconds. */
  reconnecting?: boolean;
}

export function AppHeader({ name, onHelp, onLeaveGame, onInstall, reconnecting = false }: Props) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const { mode, setMode } = useColorScheme();
  const dark = mode === "dark";
  // Light or dark only, never "follow the device": an older saved "system" choice becomes light.
  useEffect(() => {
    if (mode === "system") setMode("light");
  }, [mode, setMode]);
  const menuId = useId();
  const initial = name.trim().charAt(0).toUpperCase() || "?";

  return (
    <AppBar position="sticky">
      <Toolbar sx={{ gap: 1 }}>
        <Box component="span" aria-hidden sx={{ typography: "h5", lineHeight: 1 }}>
          ♠
        </Box>
        <Typography variant="h6" component="p" noWrap sx={{ flex: 1, minWidth: 0 }}>
          Bridge Replay
        </Typography>
        {/* The same no-signal icon as an away player's; the word too where there's room. */}
        <Box role="status" aria-live="polite">
          {reconnecting && (
            <Tooltip
              title="Reconnecting. You'll catch up on anything you missed as soon as it's back."
              enterTouchDelay={0}
              leaveTouchDelay={3000}
              arrow
            >
              <Box
                tabIndex={0}
                aria-label="Reconnecting"
                sx={{ display: "inline-flex", alignItems: "center", gap: 0.5, cursor: "help" }}
              >
                <CloudOffIcon />
                <Typography variant="body2" component="span" sx={{ display: { xs: "none", sm: "inline" } }}>
                  Reconnecting
                </Typography>
              </Box>
            </Tooltip>
          )}
        </Box>
        <Tooltip title="Help">
          <IconButton color="inherit" aria-label="Help" onClick={onHelp} size="large">
            <HelpOutlineIcon />
          </IconButton>
        </Tooltip>
        <IconButton
          aria-label={name ? `${name}: settings` : "Settings"}
          aria-controls={anchor ? menuId : undefined}
          aria-haspopup="menu"
          aria-expanded={anchor ? true : undefined}
          onClick={(e) => setAnchor(e.currentTarget)}
          size="large"
          sx={{ p: 0.5 }}
        >
          <Avatar>{initial}</Avatar>
        </IconButton>
      </Toolbar>

      <Menu id={menuId} anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)}>
        {name && (
          <Box sx={{ px: 2, pt: 1 }}>
            <Typography variant="subtitle1">{name}</Typography>
          </Box>
        )}
        <MenuItem role="menuitemcheckbox" aria-checked={dark} onClick={() => setMode(dark ? "light" : "dark")} sx={{ minWidth: (t) => t.spacing(30) }}>
          <ListItemText>Dark mode</ListItemText>
          <Switch edge="end" checked={dark} tabIndex={-1} slotProps={{ input: { "aria-hidden": true } }} />
        </MenuItem>
        <Divider />
        <MenuItem
          disabled={!onLeaveGame}
          onClick={() => {
            setAnchor(null);
            onLeaveGame?.();
          }}
        >
          <ListItemText>Leave game</ListItemText>
        </MenuItem>
        {onInstall && (
          <MenuItem
            onClick={() => {
              setAnchor(null);
              onInstall();
            }}
          >
            <ListItemText>Install to home screen</ListItemText>
          </MenuItem>
        )}
      </Menu>
    </AppBar>
  );
}

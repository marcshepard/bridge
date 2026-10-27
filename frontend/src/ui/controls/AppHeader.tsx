// The bar at the top of every screen: app icon and name, help, and your avatar. The avatar menu
// holds the Dark mode switch and "Leave game".

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
}

export function AppHeader({ name, onHelp, onLeaveGame }: Props) {
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
          <Avatar sx={{ bgcolor: "secondary.main", color: "secondary.contrastText" }}>{initial}</Avatar>
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
      </Menu>
    </AppBar>
  );
}

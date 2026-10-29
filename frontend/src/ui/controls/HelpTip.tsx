// A "?" beside a heading or a number that opens a short explanation of it, so the screen itself
// stays free of explanatory text. A tap (or click, or Enter) opens it, and a tap anywhere else
// closes it. For a longer explanation that should push the content down, use a Collapse instead.

import HelpOutlineIcon from "@mui/icons-material/HelpOutlineOutlined";
import { Box, IconButton, Popover } from "@mui/material";
import { useId, useState, type ReactNode } from "react";

interface Props {
  /** What the button explains, for screen readers: "About matchpoints". */
  label: string;
  children: ReactNode;
}

export function HelpTip({ label, children }: Props) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const id = useId();
  return (
    <>
      <IconButton
        aria-label={label}
        aria-expanded={anchor !== null}
        aria-controls={anchor ? id : undefined}
        onClick={(e) => setAnchor(e.currentTarget)}
        // A 44px tap target that doesn't push the heading's line taller than the text.
        sx={{ p: 1.5, my: -1.5, color: "text.secondary" }}
      >
        <HelpOutlineIcon fontSize="small" />
      </IconButton>
      <Popover
        id={id}
        open={anchor !== null}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        transformOrigin={{ vertical: "top", horizontal: "center" }}
      >
        <Box sx={{ p: 2, maxWidth: (t) => t.spacing(40), typography: "body2", display: "grid", gap: 1 }}>
          {children}
        </Box>
      </Popover>
    </>
  );
}

// Changing something shown on screen: an outlined button with a pencil, right next to the thing it
// changes. Labelled with the value itself (your name) or a short verb ("Correct"). See "Actions" in
// AGENTS.md for when to use this rather than another kind of button.

import EditIcon from "@mui/icons-material/EditOutlined";
import { Button } from "@mui/material";
import type { ReactNode } from "react";

interface Props {
  children: ReactNode;
  onClick: () => void;
  /** What the button does, for screen readers, e.g. "Change your name". */
  ariaLabel?: string;
}

export function EditButton({ children, onClick, ariaLabel }: Props) {
  return (
    <Button variant="outlined" endIcon={<EditIcon />} aria-label={ariaLabel} onClick={onClick} sx={{ flexShrink: 0 }}>
      {children}
    </Button>
  );
}

// A destructive action that asks once, in place: "Delete" → "Delete / Keep".
// (No browser confirm() popups: they're jarring on phones.)

import { Button, Stack } from "@mui/material";
import { useState } from "react";

interface Props {
  label: string;
  confirmLabel?: string;
  cancelLabel?: string;
  ariaLabel?: string;
  onConfirm: () => void;
}

export function ConfirmButton({ label, confirmLabel = label, cancelLabel = "Keep", ariaLabel, onConfirm }: Props) {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <Button color="inherit" aria-label={ariaLabel} onClick={() => setAsking(true)}>
        {label}
      </Button>
    );
  }
  return (
    <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
      <Button variant="contained" color="error" onClick={onConfirm}>
        {confirmLabel}
      </Button>
      <Button color="inherit" onClick={() => setAsking(false)}>
        {cancelLabel}
      </Button>
    </Stack>
  );
}

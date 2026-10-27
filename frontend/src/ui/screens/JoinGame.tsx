// Join a game: type the code you were given (or arrive with it from a shared link).

import { Alert, Button, Stack, TextField, Typography } from "@mui/material";
import { useEffect, useState } from "react";
import { games } from "../../services";
import { SheetDialog } from "../controls/SheetDialog";

interface Props {
  open: boolean;
  name: string;
  /** Filled in from a shared link. */
  initialCode?: string;
  onClose: () => void;
  onJoined: (code: string) => void;
}

export function JoinGame({ open, name, initialCode = "", onClose, onJoined }: Props) {
  const [code, setCode] = useState(initialCode);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setCode(initialCode);
      setError(null);
    }
  }, [open, initialCode]);

  const typed = code.toUpperCase().replace(/[^A-Z0-9]/g, "");

  async function join() {
    setBusy(true);
    setError(null);
    try {
      onJoined(await games.join(typed, name));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <SheetDialog
      open={open}
      title="Join a game"
      onClose={onClose}
      actions={
        <Button
          type="submit"
          form="join-form"
          variant="contained"
          size="large"
          fullWidth
          disabled={typed.length !== 8 || busy}
        >
          {busy ? "Joining…" : "Join"}
        </Button>
      }
    >
      <Stack
        id="join-form"
        component="form"
        spacing={2}
        onSubmit={(e) => {
          e.preventDefault();
          if (typed.length === 8) void join();
        }}
      >
        <Typography>Type the code from the person who started the game.</Typography>
        <TextField
          label="Join code"
          placeholder="K7PM-3QXT"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          autoFocus
          autoComplete="off"
          slotProps={{ htmlInput: { autoCapitalize: "characters", spellCheck: false, maxLength: 9 } }}
        />
        {error && <Alert severity="error">{error}</Alert>}
      </Stack>
    </SheetDialog>
  );
}

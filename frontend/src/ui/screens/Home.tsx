// The first screen. On first use it asks for your display name; then it offers Start a game and
// Join a game.

import HelpOutlineIcon from "@mui/icons-material/HelpOutlineOutlined";
import { Alert, Button, IconButton, Stack, TextField, Typography } from "@mui/material";
import { useState } from "react";
import { EditButton } from "../controls/EditButton";
import { Screen } from "../controls/Layout";

/** The backend's limit (backend/src/index.ts). */
export const MAX_NAME_LENGTH = 30;

interface Props {
  name: string;
  onName: (name: string) => void;
  onStart: () => void;
  onJoin: () => void;
  onHelp: () => void;
  /** Something to tell you on arrival, e.g. "That game was cancelled". */
  notice?: string | null;
}

export function Home({ name, onName, onStart, onJoin, onHelp, notice }: Props) {
  const [editing, setEditing] = useState(!name);
  const [draft, setDraft] = useState(name);
  const clean = draft.trim().replace(/\s+/g, " ");

  return (
    <Screen>
      <Stack direction="row" spacing={1} sx={{ alignItems: "flex-start", mt: 1, mb: 3 }}>
        <Typography variant="subtitle1" sx={{ flex: 1, pt: 1 }}>
          Four people replay the boards from an old duplicate game, scored by matchpoints (MP %) against the
          pairs who played them originally.
        </Typography>
        <IconButton aria-label="How it works" onClick={onHelp}>
          <HelpOutlineIcon />
        </IconButton>
      </Stack>

      {notice && (
        <Alert severity="info" sx={{ mb: 3 }}>
          {notice}
        </Alert>
      )}

      {editing ? (
        <Stack
          component="form"
          spacing={2}
          onSubmit={(e) => {
            e.preventDefault();
            if (!clean) return;
            onName(clean);
            setEditing(false);
          }}
        >
          <TextField
            label="Your name"
            helperText="What the others at the table will see"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            autoFocus
            autoComplete="given-name"
            slotProps={{ htmlInput: { maxLength: MAX_NAME_LENGTH } }}
          />
          <Stack direction="row" spacing={1}>
            <Button type="submit" variant="contained" disabled={!clean}>
              {name ? "Save" : "Continue"}
            </Button>
            {name && (
              <Button
                color="inherit"
                onClick={() => {
                  setDraft(name);
                  setEditing(false);
                }}
              >
                Cancel
              </Button>
            )}
          </Stack>
        </Stack>
      ) : (
        <>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 3 }}>
            <Typography>Playing as</Typography>
            <EditButton ariaLabel={`Playing as ${name}. Change your name`} onClick={() => setEditing(true)}>
              {name}
            </EditButton>
          </Stack>
          <Stack spacing={1.5}>
            <Button variant="contained" size="large" fullWidth onClick={onStart}>
              Start a game
            </Button>
            <Button variant="outlined" size="large" fullWidth onClick={onJoin}>
              Join a game
            </Button>
          </Stack>
        </>
      )}
    </Screen>
  );
}

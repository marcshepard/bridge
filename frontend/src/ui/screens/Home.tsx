// The first screen. On first use it asks for your display name; then it offers Start a game, Join a
// game, and Practice with bots (bidding and play on your own). When you have a game going, a note
// at the top says which (its title, code, board, who's in it, when you were last there), with
// Resume, and a close button that stops it being your current game. It's information, not the main
// action: after hours away you're more likely here to start something new.
//
// In dev mode (`npm run dev`) only, a section at the bottom replays a reported bid from the replay
// line in a bidding feedback email.

import HelpOutlineIcon from "@mui/icons-material/HelpOutlineOutlined";
import CloseIcon from "@mui/icons-material/Close";
import { Alert, Button, IconButton, Stack, TextField, Typography } from "@mui/material";
import { useState } from "react";
import { devMode } from "../../services";
import type { CurrentGameInfo } from "../../session/store";
import { ReplayReportDialog } from "../components/ReplayReportDialog";
import { EditButton } from "../controls/EditButton";
import { Screen, Section } from "../controls/Layout";
import { formatJoinCode, timeAgo } from "../labels";

/** The backend's limit (backend/src/index.ts). */
export const MAX_NAME_LENGTH = 30;

interface Props {
  name: string;
  onName: (name: string) => void;
  onStart: () => void;
  onJoin: () => void;
  onPractice: () => void;
  onHelp: () => void;
  /** Something to tell you on arrival, e.g. "That game was cancelled". */
  notice?: string | null;
  /** The game you're in (your current game), to go back to or put aside. */
  lastGame?: {
    code: string;
    /** Unknown for a game not on screen since this was added. */
    info: CurrentGameInfo | null;
    /** When it was last on screen. */
    at: number | null;
    onGoBack: () => void;
    /** Stop it being your current game (your seat is kept). */
    onClose: () => void;
  };
}

/** "Ann", "Ann and Bob", "Ann, Bob and Carol". */
function names(list: string[]): string {
  return list.length < 2 ? (list[0] ?? "") : `${list.slice(0, -1).join(", ")} and ${list.at(-1)}`;
}

/** The note about your current game: which it is, and where it had got to. */
function LastGameNote({ game }: { game: NonNullable<Props["lastGame"]> }) {
  const { info } = game;
  const practice = info?.practice ?? false;
  const details = [
    info && `Board ${info.board} of ${info.boardCount}${!practice && info.others.length ? `, with ${names(info.others)}` : ""}`,
    game.at !== null && timeAgo(game.at, Date.now()),
  ].filter(Boolean);
  return (
    <Alert
      severity="info"
      sx={{ mb: 3, alignItems: "center" }}
      action={
        <>
          <Button color="inherit" onClick={game.onGoBack}>
            Resume
          </Button>
          <IconButton color="inherit" aria-label="Close this note" onClick={game.onClose}>
            <CloseIcon />
          </IconButton>
        </>
      }
    >
      <Typography variant="body2" component="span" sx={{ display: "block" }}>
        <strong>{practice ? "Your last practice:" : "Your last game:"}</strong>{" "}
        {[info?.title, !practice && `code ${formatJoinCode(game.code)}`].filter(Boolean).join(" · ")}
      </Typography>
      {details.length > 0 && (
        <Typography variant="body2" component="span" sx={{ display: "block" }}>
          {details.join(" · ")}
        </Typography>
      )}
    </Alert>
  );
}

export function Home({ name, onName, onStart, onJoin, onPractice, onHelp, notice, lastGame }: Props) {
  const [editing, setEditing] = useState(!name);
  const [draft, setDraft] = useState(name);
  const clean = draft.trim().replace(/\s+/g, " ");
  const [replayOpen, setReplayOpen] = useState(false);

  return (
    <Screen>
      <Stack direction="row" spacing={1} sx={{ alignItems: "flex-start", mt: 1, mb: 3 }}>
        <Typography variant="subtitle1" sx={{ flex: 1, pt: 1 }}>
          Replay a real bridge tournament with three friends and see how you'd have done.
        </Typography>
        <IconButton aria-label="How it works" onClick={onHelp}>
          <HelpOutlineIcon />
        </IconButton>
      </Stack>

      {lastGame && <LastGameNote game={lastGame} />}

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
            <Button variant="outlined" size="large" fullWidth onClick={onPractice}>
              Practice with bots
            </Button>
          </Stack>
        </>
      )}

      {devMode && (
        <Section title="Dev mode" id="dev">
          <Button variant="outlined" onClick={() => setReplayOpen(true)}>
            Replay a reported bid
          </Button>
          <ReplayReportDialog open={replayOpen} onClose={() => setReplayOpen(false)} />
        </Section>
      )}
    </Screen>
  );
}

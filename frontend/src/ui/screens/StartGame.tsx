// Start a game: upload a game file, check what's in it, choose the starting board, create it.

import HelpOutlineIcon from "@mui/icons-material/HelpOutlineOutlined";
import { Alert, Box, Button, Collapse, IconButton, Link, MenuItem, Stack, TextField, Typography } from "@mui/material";
import { useState } from "react";
import { type GameFileV1, parseGameFile } from "../../providers/gameFile";
import { ACCEPTED_FILES, fileToGameFile } from "../../providers/importFile";
import type { Game } from "../../providers/types";
import { games } from "../../services";
import { SheetDialog } from "../controls/SheetDialog";

interface Props {
  open: boolean;
  name: string;
  onClose: () => void;
  onCreated: (code: string) => void;
}

interface Loaded {
  fileName: string;
  file: GameFileV1;
  game: Game;
}

/** Step-by-step help for getting a Common Game results page, shown under the "?" button. */
function TcgHelp() {
  return (
    <Alert severity="info" icon={false}>
      <Typography variant="subtitle2" component="p" sx={{ mb: 1 }}>
        Getting a Common Game results page
      </Typography>
      <Box component="ol" sx={{ m: 0, pl: 2.5, display: "grid", gap: 0.5 }}>
        <li>
          On a computer, go to{" "}
          <Link href="https://thecommongame.com/" target="_blank" rel="noopener noreferrer">
            thecommongame.com
          </Link>{" "}
          and choose <strong>Archived Common Game</strong>.
        </li>
        <li>Pick the date of the game, and open the results page that shows the boards and the scores.</li>
        <li>
          Save the page: press <strong>Ctrl+S</strong> (<strong>Cmd+S</strong> on a Mac) and save it as{" "}
          <strong>Webpage, HTML only</strong>.
        </li>
        <li>Choose the saved .html file here.</li>
      </Box>
      <Typography variant="body2" sx={{ mt: 1 }}>
        Phones can't easily save web pages, so start the game on the computer. To play on your phone instead,
        join the game from your phone, choose <strong>Join as replacement</strong>, pick your own seat, and tap{" "}
        <strong>Allow</strong> on the computer.
      </Typography>
      <Typography variant="body2" sx={{ mt: 1 }}>
        The page you save is the field you'll be compared with: the 299er page compares you with the 299ers.
      </Typography>
    </Alert>
  );
}

/**
 * The size of the original field, short: "938 tables/board", or "~412 tables/board" (the average,
 * rounded) when boards had different numbers of tables. Boards with no field results are left out.
 */
function fieldSummary(game: Game): string {
  const counts = game.boards.map((b) => b.field.reduce((n, f) => n + f.count, 0)).filter((n) => n > 0);
  if (counts.length === 0) return "no field results to compare with";
  const average = Math.round(counts.reduce((a, b) => a + b, 0) / counts.length);
  const varies = counts.some((n) => n !== counts[0]);
  return `${varies ? "~" : ""}${average} tables/board`;
}

export function StartGame({ open, name, onClose, onCreated }: Props) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [startBoard, setStartBoard] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  async function load(f: File) {
    setError(null);
    setLoaded(null);
    try {
      const file = fileToGameFile(f.name, await f.text());
      const game = parseGameFile(file);
      setLoaded({ fileName: f.name, file, game });
      setStartBoard(game.boards[0]!.number);
    } catch (e) {
      setError(`Couldn't use ${f.name}: ${(e as Error).message}`);
    }
  }

  async function create() {
    if (!loaded) return;
    setBusy(true);
    setError(null);
    try {
      onCreated(await games.create(name, loaded.file, startBoard));
      setLoaded(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const warnings = loaded?.game.warnings ?? [];
  // Without the original field's results there's nothing to score against: worth a warning.
  const noField = !!loaded && loaded.game.boards.every((b) => b.field.length === 0);

  return (
    <SheetDialog
      open={open}
      title="Start a game"
      onClose={onClose}
      actions={
        <Button variant="contained" size="large" fullWidth disabled={!loaded || busy} onClick={() => void create()}>
          {busy ? "Creating the game…" : loaded ? `Create the game, starting at board ${startBoard}` : "Choose a game file first"}
        </Button>
      }
    >
      <Stack spacing={2}>
        <Stack direction="row" spacing={1} sx={{ alignItems: "flex-start" }}>
          <Typography sx={{ flex: 1 }}>
            Upload a PBN file, or a Common Game results page saved from your browser.
          </Typography>
          <IconButton
            aria-label="How to save a Common Game results page"
            aria-expanded={showHelp}
            onClick={() => setShowHelp((s) => !s)}
          >
            <HelpOutlineIcon />
          </IconButton>
        </Stack>
        <Collapse in={showHelp} unmountOnExit>
          <TcgHelp />
        </Collapse>
        <Box>
          <Button variant="outlined" component="label">
            {loaded ? "Choose a different file" : "Choose a game file"}
            <input
              hidden
              type="file"
              accept={ACCEPTED_FILES}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void load(f);
                e.target.value = "";
              }}
            />
          </Button>
        </Box>

        {error && <Alert severity="error">{error}</Alert>}

        {loaded && (
          <>
            <Alert severity={warnings.length || noField ? "warning" : "success"}>
              <strong>{loaded.game.summary.title}</strong>: {loaded.game.boards.length} boards,{" "}
              {fieldSummary(loaded.game)}.
              {warnings.length > 0 && (
                <>
                  {" "}
                  {warnings.length === 1 ? "One line was skipped: " : `${warnings.length} lines were skipped, for example: `}
                  {warnings[0]}
                </>
              )}
            </Alert>
            <TextField
              select
              label="Start at board"
              value={startBoard}
              onChange={(e) => setStartBoard(Number(e.target.value))}
              helperText="You'll play on from there and wrap round."
            >
              {loaded.game.boards.map((b) => (
                <MenuItem key={b.number} value={b.number}>
                  Board {b.number}
                </MenuItem>
              ))}
            </TextField>
          </>
        )}
      </Stack>
    </SheetDialog>
  );
}

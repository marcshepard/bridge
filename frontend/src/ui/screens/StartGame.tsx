// Start a game: import a game file, check what's in it, choose how the boards are played (real
// cards or online: no default, it's a real choice) and the starting board, create it.

import PriorityHighIcon from "@mui/icons-material/PriorityHigh";
import { Alert, Button, MenuItem, Stack, TextField, Typography } from "@mui/material";
import { useState } from "react";
import { type GameFileV1, parseGameFile } from "../../providers/gameFile";
import { fileToGameFile } from "../../providers/importFile";
import type { Game } from "../../providers/types";
import { games } from "../../services";
import type { GameMode } from "../../session/store";
import { GameFileUpload } from "../components/GameFileUpload";
import { GameModeHelp } from "../components/GameModeHelp";
import { ChoiceGroup } from "../controls/ChoiceGroup";
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
  const [mode, setMode] = useState<GameMode | null>(null);
  const [startBoard, setStartBoard] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
    if (!loaded || !mode) return;
    setBusy(true);
    setError(null);
    try {
      onCreated(await games.create(name, loaded.file, startBoard, mode));
      setLoaded(null);
      setMode(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const warnings = loaded?.game.warnings ?? [];
  // Without the original field's results there's nothing to score against: worth a warning.
  const noField = !!loaded && loaded.game.boards.every((b) => b.field.length === 0);
  // What's still needed before the game can be created, said under the button.
  const toDo = [...(loaded ? [] : ["import a game file"]), ...(mode ? [] : ["choose how you'll play the boards"])];
  const toDoText = toDo.join(" and ");

  return (
    <SheetDialog
      open={open}
      title="Start a game"
      onClose={onClose}
      actions={
        <Stack spacing={1} sx={{ width: 1 }}>
          <Button variant="contained" size="large" fullWidth disabled={toDo.length > 0 || busy} onClick={() => void create()}>
            {busy ? "Creating the game…" : loaded ? `Create the game, starting at board ${startBoard}` : "Create the game"}
          </Button>
          {toDo.length > 0 && (
            <Stack
              direction="row"
              spacing={0.5}
              sx={{ justifyContent: "center", alignItems: "center", color: "warning.main" }}
              aria-live="polite"
            >
              <PriorityHighIcon fontSize="small" aria-label="Still to do" />
              <Typography variant="body2" color="text.secondary">
                {toDoText.charAt(0).toUpperCase() + toDoText.slice(1)}.
              </Typography>
            </Stack>
          )}
        </Stack>
      }
    >
      <Stack spacing={2}>
        <GameFileUpload
          loaded={!!loaded}
          onFile={(f) => void load(f)}
          extraHelp={
            <Typography variant="body2" sx={{ mt: 1 }}>
              Phones can't easily save web pages, so start the game on the computer. To play on your phone instead,
              join the game from your phone with the code and choose <strong>Join as</strong> yourself{" "}
              <strong>(owner)</strong>. If the game is still open on the computer, tap <strong>Allow</strong> there.
            </Typography>
          }
        />

        {error && <Alert severity="error">{error}</Alert>}

        <ChoiceGroup<GameMode>
          label="How will you play the boards?"
          help={<GameModeHelp />}
          value={mode}
          onChange={setMode}
          choices={[
            { value: "cards", label: "Real cards", sub: "Everyone deals their own" },
            { value: "devices", label: "Online", sub: "Bid and play on screen" },
          ]}
        />

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

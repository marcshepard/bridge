// Practice with bots: you as South, bots in the other three seats, on freshly dealt random boards or
// a game file you import (to compare with its field). Bidding and play, or bidding only (each board
// goes from its auction to the bidding review). You always start in your own seat; "Bots bid for me"
// on the bidding screen lets the bots take it over.

import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import TuneIcon from "@mui/icons-material/Tune";
import { Alert, Box, Button, MenuItem, Stack, TextField, Typography } from "@mui/material";
import { useState } from "react";
import { type SystemSettings, isDefault } from "../../core/bidding/system";
import { type GameFileV1, parseGameFile } from "../../providers/gameFile";
import { fileToGameFile } from "../../providers/importFile";
import { randomGameFile } from "../../providers/randomGame";
import type { Game } from "../../providers/types";
import { games } from "../../services";
import { GameFileUpload } from "../components/GameFileUpload";
import { ChoiceGroup } from "../controls/ChoiceGroup";
import { SheetDialog } from "../controls/SheetDialog";

interface Props {
  open: boolean;
  name: string;
  onClose: () => void;
  onCreated: (code: string) => void;
  /** Your bidding system, to say on its button whether you've changed anything. */
  system: SystemSettings;
  /** Open the bidding system page. */
  onSystem: () => void;
}

type Source = "random" | "upload";

export function Practice({ open, name, onClose, onCreated, system, onSystem }: Props) {
  const [source, setSource] = useState<Source>("random");
  const [loaded, setLoaded] = useState<{ fileName: string; file: GameFileV1; game: Game } | null>(null);
  const [startBoard, setStartBoard] = useState(1);
  const [what, setWhat] = useState<"bidding" | "play">("play");
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

  async function start() {
    setBusy(true);
    setError(null);
    try {
      // Random deals are dealt here, fresh for each practice.
      const upload = source === "upload";
      const code = await games.createPractice(name, upload ? loaded!.file : randomGameFile(), upload ? startBoard : null, what === "play");
      onCreated(code);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const ready = source === "random" || !!loaded;
  const noDoubleDummy = !!loaded && loaded.game.boards.some((b) => !b.doubleDummy?.tricks);

  return (
    <SheetDialog
      open={open}
      title="Practice with bots"
      onClose={onClose}
      actions={
        <Button variant="contained" size="large" fullWidth disabled={!ready || busy} onClick={() => void start()}>
          {busy ? "Starting…" : "Start practice"}
        </Button>
      }
    >
      <Stack spacing={2.5}>
        <Typography>
          You sit South, with a bot as your partner and bots as your opponents. After each board you see the bidding and scoring
          reviews.
        </Typography>

        <ChoiceGroup<Source>
          label="Which game?"
          value={source}
          onChange={(s) => {
            setSource(s);
            setError(null);
          }}
          choices={[
            { value: "random", label: "Random deals", sub: "Quick practice, no field to score against" },
            { value: "upload", label: "Import a game", sub: "Score yourself against its field" },
          ]}
        />
        {source === "upload" && (
          <Stack spacing={2}>
            <GameFileUpload loaded={!!loaded} onFile={(f) => void load(f)} />
            {loaded && (
              <>
                <Alert severity={noDoubleDummy ? "warning" : "success"}>
                  <strong>{loaded.game.summary.title}</strong>: {loaded.game.boards.length} boards.
                  {noDoubleDummy &&
                    " Some boards have no double-dummy tricks (Common Game pages don't include them): your device works them out after each auction, to score the contract."}
                </Alert>
                <TextField select label="Start at board" value={startBoard} onChange={(e) => setStartBoard(Number(e.target.value))}>
                  {loaded.game.boards.map((b) => (
                    <MenuItem key={b.number} value={b.number}>
                      Board {b.number}
                    </MenuItem>
                  ))}
                </TextField>
              </>
            )}
          </Stack>
        )}

        <ChoiceGroup<"bidding" | "play">
          label="What to practise"
          value={what}
          onChange={setWhat}
          choices={[
            { value: "play", label: "Bidding and play", sub: "Work on your bidding, play, and defense" },
            { value: "bidding", label: "Bidding only", sub: "Work on your bidding" },
          ]}
        />

        <Box>
          <Typography variant="subtitle2" component="p" sx={{ mb: 0.5 }}>
            Bidding system (SAYC)
          </Typography>
          <Button
            variant="outlined"
            size="large"
            fullWidth
            onClick={onSystem}
            startIcon={<TuneIcon />}
            endIcon={<ChevronRightIcon />}
            sx={{ textAlign: "left", "& .MuiButton-endIcon": { ml: "auto" } }}
          >
            <Box>
              <Typography variant="subtitle1" component="span" sx={{ display: "block", fontWeight: "fontWeightBold" }}>
                Configure bidding system
              </Typography>
              {!isDefault(system) && (
                <Typography variant="caption" component="span" color="text.secondary" sx={{ display: "block" }}>
                  With your changes
                </Typography>
              )}
            </Box>
          </Button>
        </Box>

        {error && <Alert severity="error">{error}</Alert>}
      </Stack>
    </SheetDialog>
  );
}

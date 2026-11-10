// Practice with bots: you as South, bots in the other three seats, on the built-in game or a game
// file you upload. Bidding only (each board goes from its auction to the bidding review), or bidding
// and play. You can bid (and play) your own seat, or watch the bots do all four.

import { Alert, Button, MenuItem, Stack, TextField, Typography } from "@mui/material";
import { useState } from "react";
import { type GameFileV1, parseGameFile } from "../../providers/gameFile";
import { ACCEPTED_FILES, fileToGameFile } from "../../providers/importFile";
import type { Game } from "../../providers/types";
import { games, profile } from "../../services";
import { ChoiceGroup } from "../controls/ChoiceGroup";
import { SheetDialog } from "../controls/SheetDialog";

interface Props {
  open: boolean;
  name: string;
  onClose: () => void;
  onCreated: (code: string) => void;
  /** Open the bidding system page. */
  onSystem: () => void;
}

type Source = "builtin" | "upload";
type Who = "me" | "bots";

export function Practice({ open, name, onClose, onCreated, onSystem }: Props) {
  const [source, setSource] = useState<Source>("builtin");
  const [loaded, setLoaded] = useState<{ fileName: string; file: GameFileV1; game: Game } | null>(null);
  const [startBoard, setStartBoard] = useState(1);
  const [who, setWho] = useState<Who>("me");
  const [what, setWhat] = useState<"bidding" | "play">("bidding");
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
      const code = await games.createPractice(name, source === "upload" ? loaded!.file : null, source === "upload" ? startBoard : null, what === "play");
      profile.setBotsBidForMe(code, who === "bots");
      onCreated(code);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const ready = source === "builtin" || !!loaded;
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
          You sit South, with a bot as your partner and bots as your opponents. After each auction you see every hand, how the contract
          scores, and why each bid was made.
        </Typography>

        <ChoiceGroup<Source>
          label="Which game?"
          value={source}
          onChange={(s) => {
            setSource(s);
            setError(null);
          }}
          choices={[
            { value: "builtin", label: "Built-in game", sub: "36 made-up boards" },
            { value: "upload", label: "Upload a game", sub: "PBN or Common Game page" },
          ]}
        />
        {source === "upload" && (
          <Stack spacing={2}>
            <Button variant="outlined" component="label" sx={{ alignSelf: "flex-start" }}>
              {loaded ? "Upload a different file" : "Upload a game file"}
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
            { value: "bidding", label: "Bidding only", sub: "Straight to the review" },
            { value: "play", label: "Bidding and play", sub: "Then play or defend" },
          ]}
        />

        <ChoiceGroup<Who>
          label="Who bids?"
          value={who}
          onChange={setWho}
          choices={[
            { value: "me", label: what === "play" ? "I play South" : "I bid South", sub: "The bots take the rest" },
            { value: "bots", label: "Watch the bots", sub: what === "play" ? "They bid and play all four" : "They bid all four seats" },
          ]}
        />
        <Typography variant="body2" color="text.secondary">
          You can switch between these at any time with <strong>Bots bid for me</strong> on the bidding screen.
          {what === "play" && " It covers the play too."}
        </Typography>

        <Button variant="outlined" onClick={onSystem} sx={{ alignSelf: "flex-start" }}>
          Bidding system: SAYC
        </Button>

        {error && <Alert severity="error">{error}</Alert>}
      </Stack>
    </SheetDialog>
  );
}

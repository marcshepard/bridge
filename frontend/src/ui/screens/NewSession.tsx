import { Alert, Box, Button, MenuItem, Stack, TextField, Typography } from "@mui/material";
import { useEffect, useState } from "react";
import { type Seat, SEAT_NAMES } from "../../core/types";
import type { Game, GameSummary } from "../../providers/types";
import { gameProviders, importedProvider, providerById } from "../../services";
import { CardList } from "../controls/CardList";
import { Screen, Section } from "../controls/Layout";
import { SeatPicker } from "../controls/SeatPicker";

interface Props {
  onStart: (providerId: string, game: Game, seat: Seat, startBoard: number) => void;
  onCancel: () => void;
}

type Listing = { providerId: string; providerName: string; games: GameSummary[]; error?: string };
type Message = { severity: "info" | "warning" | "error"; text: string };

export function NewSession({ onStart, onCancel }: Props) {
  const [listings, setListings] = useState<Listing[] | null>(null);
  const [picked, setPicked] = useState<{ providerId: string; game: Game } | null>(null);
  const [seat, setSeat] = useState<Seat | null>(null);
  const [startBoard, setStartBoard] = useState<number>(1);
  const [message, setMessage] = useState<Message | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let live = true;
    Promise.all(
      gameProviders.map(async (p): Promise<Listing> => {
        try {
          return { providerId: p.id, providerName: p.name, games: await p.listGames() };
        } catch (e) {
          return { providerId: p.id, providerName: p.name, games: [], error: (e as Error).message };
        }
      }),
    ).then((l) => live && setListings(l));
    return () => {
      live = false;
    };
  }, [reload]);

  function choose(providerId: string, game: Game) {
    setPicked({ providerId, game });
    setStartBoard(game.boards[0]!.number);
  }

  async function pick(providerId: string, id: string) {
    setMessage(null);
    try {
      const game = await providerById(providerId).getGame(id);
      choose(providerId, game);
      if (game.warnings.length) {
        setMessage({ severity: "warning", text: `Loaded with ${game.warnings.length} warning(s): ${game.warnings[0]}` });
      }
    } catch (e) {
      setMessage({ severity: "error", text: `Couldn't open that game: ${(e as Error).message}` });
    }
  }

  async function importFile(file: File) {
    setMessage(null);
    try {
      const game = await importedProvider.importFile(file.name, await file.text());
      setReload((n) => n + 1);
      choose(importedProvider.id, game);
      const noField = game.boards.every((b) => b.field.length === 0);
      setMessage(
        noField
          ? {
              severity: "info",
              text: `Imported ${game.boards.length} boards. This file has hands but no field results, so you'll see scores but no percentages.`,
            }
          : {
              severity: game.warnings.length ? "warning" : "info",
              text: `Imported ${game.boards.length} boards.${game.warnings.length ? ` ${game.warnings.length} warning(s): ${game.warnings[0]}` : ""}`,
            },
      );
    } catch (e) {
      setMessage({ severity: "error", text: `Couldn't import ${file.name}: ${(e as Error).message}` });
    }
  }

  return (
    <Screen>
      <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
        <Button color="inherit" onClick={onCancel}>
          Cancel
        </Button>
        <Typography variant="subtitle1">New session</Typography>
      </Stack>

      <Section title="Choose a game" id="choose-game">
        {listings === null && <Typography color="text.secondary">Loading games…</Typography>}
        <Stack spacing={1}>
          {listings?.map((l) => (
            <Box key={l.providerId}>
              {l.error && <Alert severity="error">{`${l.providerName}: ${l.error}`}</Alert>}
              {l.games.length > 0 && (
                <CardList
                  label={l.providerName}
                  items={l.games.map((g) => ({
                    key: `${l.providerId}:${g.id}`,
                    title: g.title,
                    detail: [g.date, g.session, `${g.boardCount} boards`, g.source.name].filter(Boolean).join(", "),
                    selected: picked?.providerId === l.providerId && picked.game.summary.id === g.id,
                    onClick: () => void pick(l.providerId, g.id),
                  }))}
                />
              )}
            </Box>
          ))}
        </Stack>
        <Stack direction="row" spacing={1.5} useFlexGap sx={{ mt: 2, flexWrap: "wrap", alignItems: "center" }}>
          <Button variant="outlined" component="label">
            Import a game file
            <input
              hidden
              type="file"
              accept=".pbn,.json,.txt"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void importFile(f);
                e.target.value = "";
              }}
            />
          </Button>
          <Typography variant="body2" color="text.secondary">
            PBN hand records, or this app's JSON game format.
          </Typography>
        </Stack>
        {message && (
          <Alert severity={message.severity} sx={{ mt: 2 }}>
            {message.text}
          </Alert>
        )}
      </Section>

      {picked && (
        <>
          <Section title="Where are you sitting?" id="seat">
            <SeatPicker value={seat} onChange={setSeat} />
          </Section>

          <Section title="Start at board" id="start-board-heading">
            <TextField
              select
              label="Board"
              value={startBoard}
              onChange={(e) => setStartBoard(Number(e.target.value))}
              sx={{ minWidth: 160 }}
            >
              {picked.game.boards.map((b) => (
                <MenuItem key={b.number} value={b.number}>
                  Board {b.number}
                </MenuItem>
              ))}
            </TextField>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              You'll play on from there and wrap round, so tables can start on different boards.
            </Typography>
          </Section>

          <Button
            variant="contained"
            size="large"
            fullWidth
            sx={{ mt: 3 }}
            disabled={!seat}
            onClick={() => seat && onStart(picked.providerId, picked.game, seat, startBoard)}
          >
            {seat ? `Start as ${SEAT_NAMES[seat]} at board ${startBoard}` : "Choose your seat to start"}
          </Button>
        </>
      )}
    </Screen>
  );
}

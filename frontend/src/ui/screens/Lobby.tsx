// The lobby: the join code to share, who has joined (live), and, once all four are in, the
// owner's choice of seats. In a real-cards game the owner can also add a player who isn't
// using the app. When play starts, the board screen takes over (Play.tsx).

import {
  Alert,
  Box,
  Button,
  List,
  ListItem,
  ListItemText,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useState } from "react";
import { SEATS, SEAT_NAMES, type Seat } from "../../core/types";
import { devMode, games } from "../../services";
import type { EventSnapshot, PublicPlayer } from "../../session/store";
import { Screen, Section } from "../controls/Layout";
import { SheetDialog } from "../controls/SheetDialog";
import { GameModeHelp } from "../components/GameModeHelp";
import { PlayerName } from "../controls/PlayerName";
import { formatJoinCode, isAway } from "../labels";

const PLACES = 4;

/** The link that opens this game's join dialog. */
function joinLink(code: string): string {
  return `${window.location.origin}/?join=${code}`;
}

/**
 * The join code, and Share for the invite: the device's share sheet, with the link inside the
 * text. Passed as a separate url, some apps (Outlook) drop it and others move it; one text arrives
 * the same everywhere. Where the browser can't share there's no button: the code is on screen.
 */
function ShareCode({ code }: { code: string }) {
  const canShare = typeof navigator.share === "function";

  async function share() {
    try {
      // The link carries the code.
      await navigator.share({ text: `Join our game on Bridge Replay: ${joinLink(code)}` });
    } catch {
      // Share sheet dismissed: the code is on screen to read out anyway.
    }
  }

  return (
    <Paper
      variant="outlined"
      sx={{
        px: { xs: 1, sm: 2 },
        py: 1.5,
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        justifyContent: "center",
        gap: 1,
        textAlign: "center",
      }}
    >
      <Typography variant="h6" component="p">
        <Box component="span" sx={{ color: "text.secondary", typography: "body1" }}>
          Join code{" "}
        </Box>
        <Box component="span" className="num" sx={{ letterSpacing: "0.1em", whiteSpace: "nowrap" }}>
          {formatJoinCode(code)}
        </Box>
      </Typography>
      {canShare && (
        <Button variant="outlined" onClick={() => void share()}>
          Share
        </Button>
      )}
    </Paper>
  );
}

function PlayerList({
  players,
  mySlot,
  onRemove,
  seating,
}: {
  players: PublicPlayer[];
  mySlot: number | null;
  /** The owner takes a player without the app back out. */
  onRemove?: (slot: number) => void;
  seating?: {
    seats: Record<Seat, number>;
    busy: boolean;
    onChange: (from: Seat, to: Seat) => void;
  };
}) {
  const places = Array.from({ length: PLACES }, (_, i) => players.find((p) => p.slot === i + 1) ?? null);
  return (
    <List disablePadding aria-label="Players" sx={{ display: "grid", gap: 0.75 }}>
      {places.map((p, i) => {
        const away = !!p && isAway(p, mySlot);
        const seat = seating && p ? SEATS.find((s) => seating.seats[s] === p.slot) : undefined;
        return (
          <ListItem key={i} disablePadding>
            <Paper
              variant="outlined"
              sx={{
                width: "100%",
                px: { xs: 1, sm: 2 },
                py: 0.5,
                minHeight: (t) => t.spacing(5.5),
                display: "flex",
                alignItems: "center",
                gap: 1,
                ...(p?.slot === mySlot && { borderColor: "primary.main" }),
              }}
            >
              <ListItemText
                sx={{ my: 0, minWidth: 0, overflowWrap: "anywhere" }}
                primary={
                  p ? (
                    <>
                      <PlayerName name={p.name} suffix={p.slot === mySlot ? " (you)" : ""} away={away} />
                      {(p.isCreator || p.noApp) && (
                        <Box component="span" sx={{ color: "text.secondary", typography: "body2" }}>
                          {" "}
                          · {p.isCreator ? "Owner" : "Without the app"}
                        </Box>
                      )}
                    </>
                  ) : (
                    "Waiting for a player…"
                  )
                }
                slotProps={{
                  primary: { variant: "subtitle1", component: "p", color: !p || away ? "textDisabled" : "textPrimary" },
                }}
              />
              {p?.noApp && onRemove && (
                <Button variant="outlined" disabled={seating?.busy} onClick={() => onRemove(p.slot)} aria-label={`Remove ${p.name}`}>
                  Remove
                </Button>
              )}
              {p && seat && seating && (
                <TextField
                  select
                  size="small"
                  value={seat}
                  disabled={seating.busy}
                  onChange={(e) => seating.onChange(seat, e.target.value as Seat)}
                  slotProps={{ select: { native: true, inputProps: { "aria-label": `Seat for ${p.name}` } } }}
                  sx={{ flexShrink: 0, "& select": { minHeight: (t) => t.spacing(5.5), boxSizing: "border-box" } }}
                >
                  {SEATS.map((s) => <option key={s} value={s} aria-label={SEAT_NAMES[s]}>{s}</option>)}
                </TextField>
              )}
            </Paper>
          </ListItem>
        );
      })}
    </List>
  );
}

/**
 * The owner adds someone at the table who isn't using the app (real cards only): just a name, so
 * the game can start. Their hands have to reach them some other way.
 */
function AddWithoutApp({ code }: { code: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    setBusy(true);
    setError(null);
    try {
      await games.addPlayerWithoutApp(code, name);
      // The new player arrives as a live update.
      setOpen(false);
      setName("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant="outlined" sx={{ mt: 2 }} onClick={() => setOpen(true)}>
        Add a player without the app
      </Button>
      <SheetDialog
        open={open}
        title="Add a player without the app"
        onClose={() => setOpen(false)}
        actions={
          <>
            <Button color="inherit" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="no-app-form" variant="contained" size="large" disabled={!name.trim() || busy}>
              {busy ? "Adding…" : "Add"}
            </Button>
          </>
        }
      >
        <Stack
          id="no-app-form"
          component="form"
          spacing={2}
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) void add();
          }}
        >
          <Typography>For someone at the table who isn't using the app on a device of their own.</Typography>
          <Alert severity="warning">
            The app can't show them their cards, so they'll need their hands some other way, such as a printed hand
            record. You enter the results as usual.
          </Alert>
          <TextField label="Their name" value={name} onChange={(e) => setName(e.target.value)} autoFocus autoComplete="off" />
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </SheetDialog>
    </>
  );
}

function Seating({ code, players, mySlot, onRemove }: {
  code: string;
  players: PublicPlayer[];
  mySlot: number;
  onRemove?: (slot: number) => void;
}) {
  const [seats, setSeats] = useState<Record<Seat, number>>(() => {
    const slots = players.map((p) => p.slot);
    // Shuffle once when the table fills, so presence updates don't change anyone's seat.
    for (let i = slots.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [slots[i], slots[j]] = [slots[j]!, slots[i]!];
    }
    return { N: slots[0]!, E: slots[1]!, S: slots[2]!, W: slots[3]! };
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await games.assignSeats(code, { seats });
      // The new seats arrive as a live update.
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <Stack spacing={1.5}>
      <PlayerList
        players={players}
        mySlot={mySlot}
        onRemove={onRemove}
        seating={{
          seats,
          busy,
          onChange: (from, to) => setSeats((s) => ({ ...s, [from]: s[to], [to]: s[from] })),
        }}
      />
      {error && <Alert severity="error">{error}</Alert>}
      <Button variant="contained" size="large" fullWidth disabled={busy} onClick={() => void start()}>
        {busy ? "Starting…" : "Start game"}
      </Button>
    </Stack>
  );
}

function DevTools({ code }: { code: string }) {
  const [error, setError] = useState<string | null>(null);
  return (
    <Section title="Dev mode" id="dev">
      <Button
        variant="outlined"
        onClick={() => games.fillWithTestPlayers(code).catch((e: Error) => setError(e.message))}
      >
        Fill with test players
      </Button>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
        Or open this app in more tabs with <code>?as=2</code>, <code>?as=3</code>… and join with the code: each
        tab is a separate player.
      </Typography>
      {error && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {error}
        </Alert>
      )}
    </Section>
  );
}

interface Props {
  snapshot: EventSnapshot;
  onDone: () => void;
}

export function Lobby({ snapshot, onDone }: Props) {
  const you = snapshot.you;
  const [removeError, setRemoveError] = useState<string | null>(null);

  if (snapshot.status === "ended") {
    return (
      <Screen>
        <Alert severity="info" sx={{ mt: 2 }}>
          This game has ended.
        </Alert>
        <Button variant="contained" sx={{ mt: 2 }} onClick={onDone}>
          Done
        </Button>
      </Screen>
    );
  }

  const full = snapshot.players.length === PLACES;
  const creator = snapshot.players.find((p) => p.isCreator);
  const waitingFor = PLACES - snapshot.players.length;
  const ownsCardsGame = !!you?.isCreator && snapshot.mode === "cards";
  const removePlayer = ownsCardsGame
    ? (slot: number) => {
        setRemoveError(null);
        games.removePlayerWithoutApp(snapshot.code, slot).catch((e: Error) => setRemoveError(e.message));
      }
    : undefined;

  return (
    <Screen>
      <Typography variant="h6" component="h1" sx={{ mb: 0.5 }}>
        {snapshot.title}
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 1.5 }}>
        Game type:{" "}
        <Box component="span" sx={{ color: "text.primary", fontWeight: "fontWeightMedium" }}>
          {snapshot.mode === "cards" ? "Real cards" : "Online"}
        </Box>
        <GameModeHelp />
      </Typography>
      <ShareCode code={snapshot.code} />

      <Section title="Players" id="players" tight>
        {full && you?.isCreator ? (
          <Seating key={snapshot.code} code={snapshot.code} players={snapshot.players} mySlot={you.slot} onRemove={removePlayer} />
        ) : (
          <PlayerList players={snapshot.players} mySlot={you?.slot ?? null} onRemove={removePlayer} />
        )}
        {removeError && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {removeError}
          </Alert>
        )}
        {!full && (
          <Typography color="text.secondary" sx={{ mt: 1.5 }}>
            Waiting for {waitingFor} more {waitingFor === 1 ? "player" : "players"}. Share the code with them.
          </Typography>
        )}
        {!full && ownsCardsGame && <AddWithoutApp code={snapshot.code} />}
      </Section>

      {full && !you?.isCreator && (
        <Box sx={{ mt: 3 }}>
          <Alert severity="info">Everyone's here. Waiting for {creator?.name ?? "the game's owner"} to start the game.</Alert>
        </Box>
      )}

      {devMode && !full && <DevTools code={snapshot.code} />}
    </Screen>
  );
}

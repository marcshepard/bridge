// The lobby: the join code to share, who has joined (live), and, once all four are in, the
// owner's choice of partnerships. In a real-cards game the owner can also add a player who isn't
// using the app. When play starts, the board screen takes over (Play.tsx).

import {
  Alert,
  Box,
  Button,
  List,
  ListItem,
  ListItemText,
  Divider,
  Paper,
  Stack,
  TextField,
  ToggleButton,
  Typography,
} from "@mui/material";
import CasinoIcon from "@mui/icons-material/CasinoOutlined";
import { useState } from "react";
import { devMode, games } from "../../services";
import type { EventSnapshot, PublicPlayer } from "../../session/store";
import { ChoiceGroup } from "../controls/ChoiceGroup";
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
 * The join code, and Share for the invite: the device's share sheet, with the text and the link
 * passed separately (the app shared to puts the link after the text; a few, like Outlook on a
 * computer, take only the text). Where the browser can't share, the button copies the link.
 */
function ShareCode({ code, title }: { code: string; title: string }) {
  const [copied, setCopied] = useState(false);
  const link = joinLink(code);
  const canShare = typeof navigator.share === "function";

  async function share() {
    try {
      if (canShare) {
        // The link carries the code.
        await navigator.share({ title: "Join my bridge game", text: `Join "${title}" on Bridge Replay`, url: link });
      } else {
        await navigator.clipboard.writeText(link);
        setCopied(true);
      }
    } catch {
      // Share sheet dismissed, or clipboard blocked: the code is on screen to read out anyway.
    }
  }

  return (
    // Compact, so the whole lobby fits on a phone without scrolling: the code on one line, Share under it.
    <Paper variant="outlined" sx={{ px: 2, py: 1.5, textAlign: "center" }}>
      <Typography variant="h6" component="p">
        <Box component="span" sx={{ color: "text.secondary", typography: "body1" }}>
          Join code{" "}
        </Box>
        <Box component="span" className="num" sx={{ letterSpacing: "0.1em" }}>
          {formatJoinCode(code)}
        </Box>
      </Typography>
      <Button variant="outlined" onClick={() => void share()} sx={{ mt: 1 }} aria-live="polite">
        {canShare ? "Share" : copied ? "Link copied" : "Copy link"}
      </Button>
    </Paper>
  );
}

function PlayerList({
  players,
  mySlot,
  onRemove,
}: {
  players: PublicPlayer[];
  mySlot: number | null;
  /** The owner takes a player without the app back out. */
  onRemove?: (slot: number) => void;
}) {
  const places = Array.from({ length: PLACES }, (_, i) => players.find((p) => p.slot === i + 1) ?? null);
  return (
    <List disablePadding aria-label="Players" sx={{ display: "grid", gap: 0.75 }}>
      {places.map((p, i) => {
        const away = !!p && isAway(p, mySlot);
        return (
          <ListItem key={i} disablePadding>
            <Paper
              variant="outlined"
              sx={{
                width: "100%",
                // Dense, one line each, so the lobby fits a phone without scrolling.
                px: 2,
                py: 0.5,
                minHeight: (t) => t.spacing(5.5),
                display: "flex",
                alignItems: "center",
                gap: 1,
                ...(p?.slot === mySlot && { borderColor: "primary.main" }),
              }}
            >
              <ListItemText
                sx={{ my: 0 }}
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
                <Button variant="outlined" onClick={() => onRemove(p.slot)} aria-label={`Remove ${p.name}`}>
                  Remove
                </Button>
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

/**
 * The owner picks a partner from the other three, or lets the app choose: a separate button under
 * an "or", so random doesn't look like a fourth player. One choice at a time, and the Start button
 * says which it is.
 */
function Partnerships({ code, players, mySlot }: { code: string; players: PublicPlayer[]; mySlot: number }) {
  const [choice, setChoice] = useState<number | "random" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const others = players.filter((p) => p.slot !== mySlot);

  async function start() {
    if (choice === null) return;
    setBusy(true);
    setError(null);
    try {
      await games.choosePartnerships(code, choice === "random" ? { random: true } : { partnerSlot: choice });
      // The new seats arrive as a live update.
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  const partner = typeof choice === "number" ? others.find((p) => p.slot === choice) : undefined;
  const startLabel = busy
    ? "Starting…"
    : choice === "random"
      ? "Start the game with random partners"
      : partner
        ? `Start the game: ${partner.name} is your partner`
        : "Choose a partner first";

  return (
    <Section title="Choose your partner" id="partnerships" tight>
      <ChoiceGroup<number>
        value={typeof choice === "number" ? choice : null}
        onChange={setChoice}
        choices={others.map((p) => ({ value: p.slot, label: p.name }))}
      />
      <Divider sx={{ my: 1.5, color: "text.secondary", typography: "body2" }}>or</Divider>
      <ToggleButton
        value="random"
        fullWidth
        selected={choice === "random"}
        onChange={() => setChoice("random")}
      >
        <CasinoIcon sx={{ mr: 1 }} />
        <Typography variant="h6" component="span">
          Let the app choose
        </Typography>
      </ToggleButton>
      {error && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {error}
        </Alert>
      )}
      <Button
        variant="contained"
        size="large"
        fullWidth
        sx={{ mt: 2 }}
        disabled={choice === null || busy}
        onClick={() => void start()}
      >
        {startLabel}
      </Button>
    </Section>
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
      <ShareCode code={snapshot.code} title={snapshot.title} />

      <Section title="Players" id="players" tight>
        <PlayerList
          players={snapshot.players}
          mySlot={you?.slot ?? null}
          onRemove={
            ownsCardsGame
              ? (slot) => {
                  setRemoveError(null);
                  games.removePlayerWithoutApp(snapshot.code, slot).catch((e: Error) => setRemoveError(e.message));
                }
              : undefined
          }
        />
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

      {full && you?.isCreator && <Partnerships code={snapshot.code} players={snapshot.players} mySlot={you.slot} />}
      {full && !you?.isCreator && (
        <Box sx={{ mt: 3 }}>
          <Alert severity="info">Everyone's here. Waiting for {creator?.name ?? "the game's owner"} to choose partnerships.</Alert>
        </Box>
      )}

      {devMode && !full && <DevTools code={snapshot.code} />}
    </Screen>
  );
}

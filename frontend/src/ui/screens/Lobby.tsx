// The lobby: the join code to share, who has joined (live), and, once all four are in, the
// creator's choice of partnerships. When play starts, the board screen takes over (Play.tsx).

import {
  Alert,
  Box,
  Button,
  List,
  ListItem,
  ListItemText,
  Paper,
  Typography,
} from "@mui/material";
import { useState } from "react";
import { devMode, games } from "../../services";
import type { EventSnapshot, PublicPlayer } from "../../session/store";
import { ChoiceGroup } from "../controls/ChoiceGroup";
import { Screen, Section } from "../controls/Layout";
import { PlayerName } from "../controls/PlayerName";
import { formatJoinCode, isAway } from "../labels";

const PLACES = 4;

/** The link that opens this game's join dialog. */
function joinLink(code: string): string {
  return `${window.location.origin}/?join=${code}`;
}

function ShareCode({ code, title }: { code: string; title: string }) {
  const [copied, setCopied] = useState(false);
  const link = joinLink(code);
  const canShare = typeof navigator.share === "function";

  async function share() {
    try {
      if (canShare) {
        await navigator.share({ title: "Join my bridge game", text: `Join "${title}" with code ${formatJoinCode(code)}`, url: link });
      } else {
        await navigator.clipboard.writeText(link);
        setCopied(true);
      }
    } catch {
      // Share sheet dismissed, or clipboard blocked: the code is on screen to read out anyway.
    }
  }

  return (
    <Paper variant="outlined" sx={{ p: 2, textAlign: "center" }}>
      <Typography variant="body2" color="text.secondary">
        Join code
      </Typography>
      <Typography variant="h3" component="p" className="num" sx={{ letterSpacing: "0.1em", my: 1 }}>
        {formatJoinCode(code)}
      </Typography>
      <Button variant="outlined" onClick={() => void share()}>
        {canShare ? "Share" : copied ? "Link copied" : "Copy link"}
      </Button>
    </Paper>
  );
}

function PlayerList({ players, mySlot }: { players: PublicPlayer[]; mySlot: number | null }) {
  const places = Array.from({ length: PLACES }, (_, i) => players.find((p) => p.slot === i + 1) ?? null);
  return (
    <List disablePadding aria-label="Players" sx={{ display: "grid", gap: 1 }}>
      {places.map((p, i) => {
        const away = !!p && isAway(p, mySlot);
        return (
          <ListItem key={i} disablePadding>
            <Paper variant="outlined" sx={{ width: "100%", px: 2, py: 1, ...(p?.slot === mySlot && { borderColor: "primary.main" }) }}>
              <ListItemText
                primary={
                  p ? (
                    <PlayerName name={p.name} suffix={p.slot === mySlot ? " (you)" : ""} away={away} />
                  ) : (
                    "Waiting for a player…"
                  )
                }
                secondary={p?.isCreator ? "Started the game" : undefined}
                slotProps={{
                  primary: { variant: "subtitle1", component: "p", color: !p || away ? "textDisabled" : "textPrimary" },
                }}
              />
            </Paper>
          </ListItem>
        );
      })}
    </List>
  );
}

/** The creator picks a partner from the other three, or Random. */
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

  return (
    <Section title="Choose partnerships" id="partnerships">
      <Typography>Everyone's here. Who's your partner?</Typography>
      <ChoiceGroup<number | "random">
        value={choice}
        onChange={setChoice}
        choices={[
          ...others.map((p) => ({ value: p.slot, label: p.name })),
          { value: "random" as const, label: "Random" },
        ]}
      />
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
        {busy ? "Starting…" : "Start the game"}
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

  return (
    <Screen>
      <Typography variant="h5" component="h1" sx={{ mt: 2, mb: 2 }}>
        {snapshot.title}
      </Typography>
      <ShareCode code={snapshot.code} title={snapshot.title} />

      <Section title="Players" id="players">
        <PlayerList players={snapshot.players} mySlot={you?.slot ?? null} />
        {!full && (
          <Typography color="text.secondary" sx={{ mt: 1.5 }}>
            Waiting for {waitingFor} more {waitingFor === 1 ? "player" : "players"}. Share the code with them.
          </Typography>
        )}
      </Section>

      {full && you?.isCreator && <Partnerships code={snapshot.code} players={snapshot.players} mySlot={you.slot} />}
      {full && !you?.isCreator && (
        <Box sx={{ mt: 3 }}>
          <Alert severity="info">Everyone's here. Waiting for {creator?.name ?? "the person who started the game"} to choose partnerships.</Alert>
        </Box>
      )}

      {devMode && !full && <DevTools code={snapshot.code} />}
    </Screen>
  );
}

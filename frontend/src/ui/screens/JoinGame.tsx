// Join a game: type the code you were given (or arrive with it from a shared link).
//
// If the game is full or has started, the same dialog lists who's playing so you can ask to take
// over someone's seat (replacing them, or carrying on as yourself on this device). In the lobby,
// when the owner is away or you've the owner's name, it offers to join as the owner: the way to
// start a game on a computer and carry on from your phone. Someone at the table has to allow a
// takeover (until then the dialog waits), unless nobody is connected: then it's straight away.

import {
  Alert,
  Button,
  CircularProgress,
  FormControlLabel,
  Radio,
  RadioGroup,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useEffect, useId, useState } from "react";
import { SEAT_NAMES } from "../../core/types";
import { games } from "../../services";
import { ApiError } from "../../session/apiGameStore";
import type { PublicPlayer } from "../../session/store";
import { SheetDialog } from "../controls/SheetDialog";
import { isAway, sameName } from "../labels";

/** How often to check on a seat request while waiting. */
const POLL_MS = 2_000;

interface Props {
  open: boolean;
  name: string;
  /** Filled in from a shared link. */
  initialCode?: string;
  onClose: () => void;
  onJoined: (code: string) => void;
}

/**
 * Joining normally; or joining the lobby as its owner or as a new player; or the game is full, so
 * pick whose seat to ask for; or waiting for an answer.
 */
type Step =
  | { kind: "code" }
  | { kind: "owner"; owner: PublicPlayer; players: PublicPlayer[] }
  | { kind: "pick"; reason: string; players: PublicPlayer[] }
  | { kind: "waiting"; requestId: string; players: PublicPlayer[]; back: Step };

function playerLabel(p: PublicPlayer): string {
  const who = p.seat ? `${SEAT_NAMES[p.seat]}: ${p.name}` : p.name;
  return p.noApp ? `${who} (without the app)` : isAway(p, null) ? `${who} (away)` : who;
}

export function JoinGame({ open, name, initialCode = "", onClose, onJoined }: Props) {
  const [code, setCode] = useState(initialCode);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<Step>({ kind: "code" });
  const [slot, setSlot] = useState<number | null>(null);
  const pickLabel = useId();

  useEffect(() => {
    if (open) {
      setCode(initialCode);
      setError(null);
      setStep({ kind: "code" });
      setSlot(null);
    }
  }, [open, initialCode]);

  const typed = code.toUpperCase().replace(/[^A-Z0-9]/g, "");

  // While waiting, check on the request until someone answers it.
  const waitingId = step.kind === "waiting" ? step.requestId : null;
  useEffect(() => {
    if (!waitingId || step.kind !== "waiting") return;
    const back = step.back;
    const timer = setInterval(() => {
      games.seatRequestStatus(typed, waitingId).then(
        (status) => {
          if (status === "allowed") {
            setStep({ kind: "code" });
            onJoined(typed);
          } else if (status === "denied") {
            setStep(back);
            setError("Your request wasn't accepted.");
          } else if (status === "expired") {
            setStep(back);
            setError("Nobody answered in time. You can ask again.");
          } else if (status === "cancelled") setStep(back);
        },
        () => {
          // A dropped check: try again next time round.
        },
      );
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [waitingId]); // the step's other fields don't change while waiting

  async function join() {
    setBusy(true);
    setError(null);
    try {
      // A lobby whose owner is away, or has your name: maybe it's you, carrying on from this device.
      const snap = await games.snapshot(typed).catch(() => null);
      const owner = snap?.players.find((p) => p.isCreator);
      const room = !!snap && snap.status === "lobby" && snap.players.length < 4;
      if (snap && !snap.you && room && owner && (isAway(owner, null) || sameName(owner.name, name))) {
        setStep({ kind: "owner", owner, players: snap.players });
        return;
      }
      onJoined(await games.join(typed, name));
    } catch (e) {
      // Full or started: offer to take over a seat instead.
      if (e instanceof ApiError && e.status === 409) {
        try {
          const snap = await games.snapshot(typed);
          setStep({ kind: "pick", reason: e.message, players: snap.players });
          setSlot(null);
          return;
        } catch {
          // Fall through and show the original reason.
        }
      }
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  /** Ask for a player's seat: straight in if nobody's there to answer, else wait for an answer. */
  async function ask(askFor: number | null = slot) {
    if ((step.kind !== "pick" && step.kind !== "owner") || askFor === null) return;
    setBusy(true);
    setError(null);
    try {
      const r = await games.requestSeat(typed, name, askFor);
      if (r.allowed) {
        setStep({ kind: "code" });
        onJoined(typed);
      } else {
        setSlot(askFor);
        setStep({ kind: "waiting", requestId: r.requestId, players: step.players, back: step });
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  /** In the lobby: not the owner after all, so take a new place. */
  async function joinAsNew() {
    setBusy(true);
    setError(null);
    try {
      onJoined(await games.join(typed, name));
      setStep({ kind: "code" });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  /** Closing while waiting withdraws the request. */
  function close() {
    if (step.kind === "waiting") void games.cancelSeatRequest(typed, step.requestId).catch(() => {});
    onClose();
  }

  const asked = step.kind === "waiting" ? step.players.find((p) => p.slot === slot) : undefined;

  return (
    <SheetDialog
      open={open}
      title="Join a game"
      onClose={close}
      actions={
        step.kind === "waiting" ? (
          <Button color="inherit" onClick={close}>
            Cancel
          </Button>
        ) : step.kind === "owner" ? (
          <Stack spacing={1} sx={{ width: 1 }}>
            <Button variant="contained" size="large" fullWidth disabled={busy} onClick={() => void ask(step.owner.slot)}>
              Join as {step.owner.name} (owner)
            </Button>
            <Button variant="outlined" size="large" fullWidth disabled={busy} onClick={() => void joinAsNew()}>
              Join as a new player
            </Button>
          </Stack>
        ) : (
          <Button
            type="submit"
            form="join-form"
            variant="contained"
            size="large"
            fullWidth
            disabled={typed.length !== 8 || busy || (step.kind === "pick" && slot === null)}
          >
            {step.kind === "pick" ? (busy ? "Sending…" : "Join as replacement") : busy ? "Joining…" : "Join"}
          </Button>
        )
      }
    >
      {step.kind === "waiting" ? (
        <Stack spacing={2} sx={{ alignItems: "center", textAlign: "center", py: 2 }} role="status">
          <CircularProgress />
          <Typography>
            Waiting for someone at the table to accept
            {asked && (sameName(asked.name, name) ? " you on this device" : ` you in place of ${asked.name}`)}…
          </Typography>
          {asked?.isCreator && (
            <Typography color="text.secondary">
              Still have the game open on another device? Tap <strong>Allow</strong> there.
            </Typography>
          )}
        </Stack>
      ) : step.kind === "owner" ? (
        <Stack spacing={2}>
          <Typography>
            {step.owner.name} started this game{isAway(step.owner, null) ? " and isn't connected right now" : ""}. Are
            you {step.owner.name}, carrying on from this device?
          </Typography>
          <Typography color="text.secondary">
            Joining as the owner moves the game to this device: you'll enter the results and move the table on from
            here.
          </Typography>
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      ) : (
        <Stack
          id="join-form"
          component="form"
          spacing={2}
          onSubmit={(e) => {
            e.preventDefault();
            if (typed.length !== 8) return;
            void (step.kind === "pick" ? ask() : join());
          }}
        >
          <Typography>Type the code from the person who started the game.</Typography>
          <TextField
            label="Join code"
            placeholder="K7PM-3QXT"
            value={code}
            onChange={(e) => {
              setCode(e.target.value.toUpperCase());
              setStep({ kind: "code" });
              setError(null);
            }}
            autoFocus
            autoComplete="off"
            slotProps={{ htmlInput: { autoCapitalize: "characters", spellCheck: false, maxLength: 9 } }}
          />
          {step.kind === "pick" && (
            <>
              <Alert severity="warning">{step.reason}</Alert>
              <Typography id={pickLabel} variant="subtitle1" component="p">
                Who are you replacing?
              </Typography>
              <RadioGroup
                aria-labelledby={pickLabel}
                value={slot === null ? "" : String(slot)}
                onChange={(e) => setSlot(Number(e.target.value))}
              >
                {step.players.map((p) => (
                  <FormControlLabel
                    key={p.slot}
                    value={String(p.slot)}
                    control={<Radio />}
                    label={playerLabel(p)}
                    sx={{ minHeight: (t) => t.spacing(5.5), color: isAway(p, null) ? "text.secondary" : undefined }}
                  />
                ))}
              </RadioGroup>
            </>
          )}
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      )}
    </SheetDialog>
  );
}

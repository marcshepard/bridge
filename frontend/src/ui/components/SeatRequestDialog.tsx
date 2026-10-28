// Someone wants to take over a seat at your table: a new player replacing someone, or a player
// moving to another device. Everyone connected sees this; whoever answers first decides.

import { Alert, Button, Typography } from "@mui/material";
import { useState } from "react";
import { SEAT_NAMES } from "../../core/types";
import type { PublicPlayer, SeatRequestDto } from "../../session/store";
import { SheetDialog } from "../controls/SheetDialog";
import { sameName } from "../labels";

interface Props {
  request: SeatRequestDto;
  players: PublicPlayer[];
  onAnswer: (allow: boolean) => Promise<void>;
  /** Not now: hide it here and leave it to someone else at the table. */
  onLater: () => void;
}

export function SeatRequestDialog({ request, players, onAnswer, onLater }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seat = players.find((p) => p.slot === request.slot);
  const seatName = seat?.seat ? ` (${SEAT_NAMES[seat.seat]})` : "";
  const moving = !!seat && sameName(seat.name, request.name);

  async function answer(allow: boolean) {
    setBusy(true);
    setError(null);
    try {
      await onAnswer(allow);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <SheetDialog
      open
      title={
        moving
          ? `${request.name} wants to move to another device`
          : `${request.name} wants to replace ${seat?.name ?? "a player"}`
      }
      onClose={onLater}
      actions={
        <>
          <Button variant="outlined" disabled={busy} onClick={() => void answer(false)}>
            Deny
          </Button>
          <Button variant="contained" size="large" disabled={busy} onClick={() => void answer(true)}>
            Allow
          </Button>
        </>
      }
    >
      <Typography>
        {moving ? (
          <>
            {request.name} is asking to carry on in their seat{seatName} from a different phone, tablet or computer.
            Their old device will leave the game.
          </>
        ) : (
          <>
            {request.name} is asking to take over {seat?.name ?? "a player"}'s seat{seatName}.
          </>
        )}{" "}
        Only allow it if you know who's asking.
      </Typography>
      {error && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {error}
        </Alert>
      )}
    </SheetDialog>
  );
}

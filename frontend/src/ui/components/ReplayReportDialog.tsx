// Dev mode only (Home shows it under `npm run dev`): paste the replay line from a bidding feedback
// email and see the reported call against the bots as they are now. One view, nothing to tap: the
// whole auction with the reported call shaded, what the bot would bid there now and why (as for
// your own call in the review: "would bid the same", or what instead), and the four hands.
//
// The settings come from the line and are used for this view only: your own bidding system is
// never read or changed.

import { Alert, Box, Button, Stack, TextField, Typography } from "@mui/material";
import { useState } from "react";
import { type Seat, SEATS } from "../../core/types";
import { type ReplayBoard, parseReplayLine } from "../../providers/replayLine";
import { Compass } from "../controls/Compass";
import { SheetDialog } from "../controls/SheetDialog";
import { systemWords } from "../feedback";
import { AuctionTable } from "./Auction";
import { BotVerdict, useReviewedAuction } from "./BiddingReview";
import { SeatHand } from "./Hand";

export function ReplayReportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [replay, setReplay] = useState<ReplayBoard | null>(null);

  function read() {
    try {
      setReplay(parseReplayLine(text));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <SheetDialog
      open={open}
      title="Replay a reported bid"
      onClose={onClose}
      actions={
        replay ? (
          <Button variant="outlined" onClick={() => setReplay(null)}>
            Paste another
          </Button>
        ) : (
          <Button variant="contained" disabled={!text.trim()} onClick={read}>
            Open
          </Button>
        )
      }
    >
      {replay ? (
        <Replay replay={replay} />
      ) : (
        <Stack spacing={2}>
          <TextField
            label="Replay line"
            helperText='The "For replay:" line at the end of a bidding feedback email'
            value={text}
            onChange={(e) => setText(e.target.value)}
            multiline
            minRows={3}
            autoFocus
          />
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      )}
    </SheetDialog>
  );
}

const NO_NAMES = Object.fromEntries(SEATS.map((s) => [s, ""])) as Record<Seat, string>;

function Replay({ replay: { board, calls, reported, systems } }: { replay: ReplayBoard }) {
  const { review, simulating } = useReviewedAuction(board, calls, systems, true);
  const r = review[reported];
  if (!r) return null;
  return (
    <Stack spacing={2}>
      <Typography variant="body2" color="text.secondary">
        Board {board.number}, bid by the bots as they are now. North–South {systemWords(systems.NS)}; East–West{" "}
        {systemWords(systems.EW)}. Your own bidding system isn't changed.
      </Typography>
      <AuctionTable dealer={board.dealer} vul={board.vul} names={NO_NAMES} calls={calls} seat={r.seat} shaded={reported} />
      <Box>
        <Typography variant="subtitle2" component="h3" color="text.secondary" sx={{ mb: 1 }}>
          What the bot bids here now
        </Typography>
        <Stack spacing={1}>
          {/* Reviewed as the player's call: the bot's own call here, and whether it matches. */}
          <BotVerdict r={r} isBot={false} isMine />
          {simulating && r.bot.hard && !r.bot.simulation && (
            <Typography variant="body2" color="text.secondary">
              Working out the hard call…
            </Typography>
          )}
        </Stack>
      </Box>
      <Compass
        me={r.seat}
        bottom="S"
        seats={Object.fromEntries(SEATS.map((s) => [s, <SeatHand key={s} seat={s} hand={board.hands[s]} trump={null} />])) as Record<Seat, React.ReactNode>}
        label="All four hands"
      />
    </Stack>
  );
}

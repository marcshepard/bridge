// Your games (the avatar menu): the online games you've played on this device, newest first, with
// your side's score, your partner and your opponents. Practice and real-cards games aren't in it.
// Kept on this device only (the profile), so it can be cleared here.

import { Box, Divider, List, ListItem, Stack, Typography } from "@mui/material";
import { Fragment, useState } from "react";
import { profile } from "../../services";
import { type GameHistoryEntry, type HistoryPlayer, MAX_HISTORY } from "../../session/store";
import { ConfirmButton } from "../controls/ConfirmButton";
import { ScoreChip, toneOf } from "../controls/ScoreChip";
import { SheetDialog } from "../controls/SheetDialog";
import { formatMargin } from "../labels";

/** "Ann", or "a bot". */
const who = (p: HistoryPlayer) => (p.bot ? "a bot" : p.name);

/** "Jane and Fred", "John and a bot", "bots". */
function opponentsText(players: HistoryPlayer[]): string {
  if (players.length > 0 && players.every((p) => p.bot)) return "bots";
  const people = players.filter((p) => !p.bot).map((p) => p.name);
  return [...people, ...players.filter((p) => p.bot).map(() => "a bot")].join(" and ");
}

/** "11/23/26, 7:03 PM", in the device's own format. */
function when(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
}

function Row({ e }: { e: GameHistoryEntry }) {
  const score = `${e.direction} ${formatMargin(e.net)}`;
  return (
    <ListItem disableGutters sx={{ display: "block", py: 1.5 }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: "space-between" }}>
        <Typography sx={{ fontWeight: "fontWeightMedium" }}>{when(e.startedAt)}</Typography>
        <ScoreChip label={score} tone={toneOf(e.net)} size="small" ariaLabel={`Your score: ${score}`} />
      </Stack>
      <Typography variant="body2" color="text.secondary">
        With {who(e.partner)}, against {opponentsText(e.opponents)} · {e.boards} {e.boards === 1 ? "board" : "boards"}
      </Typography>
      <Typography variant="body2" color="text.secondary" noWrap>
        {e.title}
      </Typography>
    </ListItem>
  );
}

export function GameHistoryDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  // Read when opened; cleared here, it empties at once.
  const [, setCleared] = useState(0);
  const entries = open ? profile.gameHistory() : [];
  return (
    <SheetDialog
      open={open}
      onClose={onClose}
      title="Your games"
      actions={
        entries.length > 0 ? (
          <ConfirmButton
            label="Clear history"
            confirmLabel="Clear"
            onConfirm={() => {
              profile.clearGameHistory();
              setCleared((n) => n + 1);
            }}
          />
        ) : undefined
      }
    >
      <Typography variant="body2" color="text.secondary">
        Your last {MAX_HISTORY} online games on this device, newest first. Your score is the same as at the top right
        of the result screen: on each board, your side's matchpoint % minus the opponents' (63% counts as +26), added
        up. Practice games aren't included.
      </Typography>
      {entries.length === 0 ? (
        <Box sx={{ mt: 2 }}>
          <Typography>No games yet. Play an online game with other people and it shows here, board by board.</Typography>
        </Box>
      ) : (
        <List>
          {entries.map((e, i) => (
            <Fragment key={e.code}>
              {i > 0 && <Divider component="li" />}
              <Row e={e} />
            </Fragment>
          ))}
        </List>
      )}
    </SheetDialog>
  );
}

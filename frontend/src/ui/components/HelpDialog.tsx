// How the app works, for someone who has never used it (or played duplicate). Opened from the help
// buttons. Keep it in step with what the app actually does (see AGENTS.md).

import { Box, Link, Typography } from "@mui/material";
import type { ReactNode } from "react";
import { SheetDialog } from "../controls/SheetDialog";

const LEARN_MORE = "https://en.wikipedia.org/wiki/Duplicate_bridge#Scoring";
const FEEDBACK_EMAIL = "navia.apps@gmail.com";

function Heading({ children }: { children: ReactNode }) {
  return (
    <Typography variant="subtitle1" component="h3" sx={{ mt: 3, mb: 1 }}>
      {children}
    </Typography>
  );
}

export function HelpDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <SheetDialog open={open} title="How it works" onClose={onClose}>
      <Typography>
        Four of you replay the boards from an old duplicate game, each on your own phone, tablet or computer.
        After each board you see how your result compares with everyone who played it in the original game.
      </Typography>

      <Heading>Getting started</Heading>
      <Box component="ol" sx={{ m: 0, pl: 2.5, display: "grid", gap: 1 }}>
        <li>
          <strong>Start a game:</strong> one person uploads the game: a PBN file, or a Common Game results page
          saved from your browser. They get a join code to share with the others.
        </li>
        <li>
          <strong>Join a game:</strong> the others type the code, or open the link they were sent.
        </li>
        <li>
          <strong>Partners:</strong> once all four have joined, the person who started the game picks partners
          (or lets the app choose at random). Each screen then shows where everyone sits.
        </li>
        <li>
          <strong>Deal:</strong> use one deck per player. Each of you takes your own 13 cards from your deck, as
          your screen shows them, so nobody sees the other hands.
        </li>
      </Box>

      <Heading>Playing a board</Heading>
      <Box component="ol" sx={{ m: 0, pl: 2.5, display: "grid", gap: 1 }}>
        <li>
          The board screen shows who sits where (you at the bottom), the dealer, who is vulnerable, and your 13
          cards. Take those cards from your deck, then bid and play as normal.
        </li>
        <li>
          When the board is finished, anyone taps <strong>Enter the result</strong>: the contract, who declared,
          and how many tricks declarer took. It appears on everyone's screen at once, with who entered it. If it's
          wrong, anyone can tap <strong>Correct it</strong>.
        </li>
        <li>
          You then see all four hands, your side's score, and both sides' matchpoints, for example 83 / 17.{" "}
          <strong>Score breakdown</strong> shows how the score adds up, <strong>The field</strong> shows what the
          original pairs scored, and <strong>Analysis</strong> shows the best possible result and any expert
          commentary.
        </li>
        <li>
          Tap <strong>Next board</strong> when you're ready. Each screen moves on by itself, so nobody waits for
          anyone else. The running tally at the top (for example NS +140) adds up how far ahead or behind the
          field you are; tap it to see every board.
        </li>
      </Box>

      <Heading>How scoring works</Heading>
      <Typography sx={{ mb: 1 }}>
        Your score on a board comes from the normal bridge scoring for the contract and the tricks taken. What
        matters in duplicate is how that score compares with everyone else who played the same cards. Here, that's
        the original field: the pairs who played this board in the real game, sitting the same way as you.
      </Typography>
      <Typography sx={{ mb: 1 }}>
        You get a <strong>matchpoint percentage (MP %)</strong>: the share of those pairs you beat, with a tie
        counting as half.
      </Typography>
      <Box sx={{ bgcolor: "action.hover", borderRadius: 1, p: 2, mb: 1 }}>
        <Typography variant="subtitle2" component="p" sx={{ mb: 0.5 }}>
          Example
        </Typography>
        <Typography variant="body2">
          You're North–South. You bid 4♠ and make it, which scores +420. In the original game 100 pairs sat
          North–South on this board: 60 scored less than +420, 20 also scored +420, and 20 scored more.
        </Typography>
        <Typography variant="body2" sx={{ mt: 1 }}>
          You beat 60 and tied with 20, which counts as 10 more: (60 + 10) ÷ 100 = <strong>70%</strong>. Your
          opponents get the rest, 30%, shown as 70 / 30. Over a session, an average above 50% means you did
          better than the field.
        </Typography>
        <Typography variant="body2" sx={{ mt: 1 }}>
          Each board also shows a <strong>net</strong>: your % minus theirs. 70 / 30 nets +40, and 45 / 55 nets
          −10. The running tally at the top adds up the nets, so above zero means you're ahead of the field.
          Percentages are shown as whole numbers, except when that would hide where a net comes from: 95.4%
          nets +91, so it shows as 95.4 − 4.6 rather than 95 − 5.
        </Typography>
      </Box>
      <Typography>
        New to duplicate scoring?{" "}
        <Link href={LEARN_MORE} target="_blank" rel="noopener noreferrer">
          Learn more about how it works
        </Link>
        .
      </Typography>

      <Heading>Put it on your home screen</Heading>
      <Typography sx={{ mb: 1 }}>
        Install the app and it opens like any other app, full screen, from its own icon.
      </Typography>
      <Box component="ul" sx={{ m: 0, pl: 2.5, display: "grid", gap: 0.5 }}>
        <li>
          <strong>Android (Chrome):</strong> tap the ⋮ menu, then <strong>Install app</strong> (or{" "}
          <strong>Add to Home screen</strong>).
        </li>
        <li>
          <strong>iPhone or iPad (Safari):</strong> tap the Share button, then <strong>Add to Home Screen</strong>.
        </li>
        <li>
          <strong>Computer (Chrome or Edge):</strong> click the install icon at the right of the address bar.
        </li>
      </Box>

      <Heading>Questions or ideas?</Heading>
      <Typography>
        <Link href={`mailto:${FEEDBACK_EMAIL}?subject=Bridge%20Replay%20feedback`}>Send feedback</Link> to{" "}
        {FEEDBACK_EMAIL}. Problems, suggestions and "this confused me" are all welcome.
      </Typography>
    </SheetDialog>
  );
}

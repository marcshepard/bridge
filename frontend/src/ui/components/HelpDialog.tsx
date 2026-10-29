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
          <strong>Start demo game</strong> to see how it works on your own. You get a made-up game (the deals
          are real, but the other results and the commentary are invented), with three bots at the table
          (Bot 2, Bot 3 and Bot 4). Pick a partner, then deal yourself each board and enter any contract and
          result you like. It starts at board 9 of 36, to show that a game can start part-way through and
          wrap round. If you play a board's cards on your device (see below), the bots play theirs, with simple
          rules, and they accept any claim.
        </li>
        <li>
          <strong>Deal:</strong> use one deck per player. Each of you takes your own 13 cards from your deck, as
          your screen shows them, so nobody sees the other hands.
        </li>
      </Box>

      <Heading>Playing a board</Heading>
      <Box component="ol" sx={{ m: 0, pl: 2.5, display: "grid", gap: 1 }}>
        <li>
          The board screen shows who sits where (you at the bottom, partner opposite). <strong>Dealer</strong>{" "}
          and <strong>Vulnerable</strong> labels under the names show who deals and which side is vulnerable;
          a side with no label isn't. Below that are your 13 cards, sorted by suit, with your high-card points
          (HCP: ace 4, king 3, queen 2, jack 1). Tap <strong>Large</strong> to show them bigger, a suit per row,
          and <strong>Small</strong> to go back. Take those cards
          from your deck, then bid and play as normal.
        </li>
        <li>
          The number in the middle of the table is the board you're on, counting from 1. Tap it to see which
          game it comes from, its number in that game, and how many results from the original game it's
          scored against.
        </li>
        <li>
          When the bidding is over, anyone taps <strong>Contract: Tap to enter</strong> and enters the contract and who's
          declaring (or <strong>Passed out</strong>). It shows on everyone's screen at once, so you can all keep
          it in mind during the play, for example <strong>Contract: 4♠ by West</strong>. If it's wrong, tap the
          contract to change it.
        </li>
        <li>
          When the play is over, anyone taps <strong>Enter the result</strong>: how many tricks declarer took. If
          a result turns out to be wrong, anyone can tap the result to correct it, even on an earlier board.
          Everyone else gets a message saying which board changed, since it can change the running tally.
        </li>
        <li>
          You then see the result in two lines, for example <strong>2♣× by N, made, +180 N/S</strong> and{" "}
          <strong>83% matchpoints, net +66</strong>. Below them, the table fills in with all four hands, each in
          its seat (you're still at the bottom). Each part of the result opens more: tap the
          score to see how it adds up, and the matchpoints to see what the original pairs scored. When the
          board has expert commentary, an <strong>Analysis</strong> button shows it, with the best possible
          result.
        </li>
        <li>
          Tap <strong>Next board</strong> when you're ready. Each screen moves on by itself, so nobody waits for
          anyone else. The running tally at the top (for example NS +140) adds up how far ahead or behind the
          field you are; tap it to see every board.
        </li>
        <li>
          If someone's phone goes to sleep or loses signal, their name is greyed out with a small no-signal icon
          (a cloud with a line through it) until they're back. A blip of a few seconds shows nothing. Tap the icon to see what it means. If it's yours, the same icon shows at the top, beside Help (with <strong>Reconnecting</strong> where there's room); the app
          reconnects by itself and catches up on anything you missed.
        </li>
      </Box>

      <Heading>Playing online, on your devices (being tried out)</Heading>
      <Typography sx={{ mb: 1 }}>
        Instead of real cards and bidding boxes, you can bid and play a board on your phones, tablets or
        computers. For now, the person who started the game turns it on, one board at a time.
      </Typography>
      <Box component="ol" sx={{ m: 0, pl: 2.5, display: "grid", gap: 1 }}>
        <li>
          The person who started the game taps <strong>Play online</strong>, next to the contract. Everyone's screen
          goes to that board and shows the auction. (If you've already bid with real cards and entered the
          contract, it goes straight to the card play.)
        </li>
        <li>
          <strong>Bidding:</strong> the auction is written in four columns, West, North, East, South, starting
          under the dealer; a vulnerable side's names are in red. When it's your turn, tap a level (1 to 7) and
          then a suit or NT, or tap <strong>Pass</strong>, <strong>X</strong> (double) or <strong>XX</strong>{" "}
          (redouble). Bids you can't make are greyed out: a bid has to be higher than the last one, you can only
          double an opponent's bid, and only redouble an opponent's double. The button at the bottom then says
          what you picked: tap <strong>Submit 3♥</strong> (or <strong>Submit Pass</strong>, and so on) to make it. A bid
          can't be taken back.
        </li>
        <li>
          The auction ends after three passes in a row following a bid. The contract goes in for everyone, and the
          card play starts. If all four pass first, the board is passed out and scored as that. During the play,
          tap the contract at the top to see the auction again.
        </li>
        <li>
          In a game with robot players (a demo game), the person who started it bids for the robots: their screen
          says <strong>Bid for North</strong> and shows that robot's hand. The robots play their own cards.
        </li>
        <li>
          Once the card play starts, everyone's screen shows the table: your cards
          at the bottom, the trick in the middle, and at the top the contract, whose turn it is and the tricks
          each side has won. When it's your turn, it says{" "}
          <strong>Your turn</strong> in a green box that pulses. When you're declarer and it's dummy's turn, it says{" "}
          <strong>Dummy's turn</strong> in the same green box: play a card from dummy.
        </li>
        <li>
          To play a card, tap it once to pick it (it lifts up), then tap it again to play it. Cards you can't
          play right now are greyed out: you have to follow suit when you can. When only one card can be played,
          it's already picked for you, so one tap plays it. A card can't be taken back once it's played.
        </li>
        <li>
          After the opening lead, dummy's cards are shown to everyone. Declarer plays dummy's cards as well as
          their own; dummy just watches.
        </li>
        <li>
          When a trick is complete, it stays face up in the middle so you can look at it as long as you need (up
          to 30 seconds). Tap it to close it when you're done; leading to the next trick closes it too. If
          someone else leads first, a message at the bottom says the next trick has started: close the old
          trick to see the new one and play to it. Until the next card is led, you can tap a closed trick to
          see it again. Dummy's screen closes the trick by itself when the next card is led.
        </li>
        <li>
          <strong>Claim:</strong> when you know how the rest will go, tap <strong>Claim</strong> and say how many
          of the tricks left your side will take. Your cards are shown to everyone and play stops. Your
          opponents accept or refuse (when a defender claims, declarer answers alone). If they accept, that's
          the result. If either refuses, play goes on. You can take a claim back until it's accepted.
        </li>
        <li>
          When the last card is played, or a claim is accepted, the line above the table says how it went, for
          example <strong>Game down 1: 9 tricks</strong>. The result is saved for everyone straight away, and a
          few seconds later every screen shows the result and the four hands as usual.
        </li>
      </Box>

      <Heading>Swapping a player, or changing devices</Heading>
      <Typography sx={{ mb: 1 }}>
        If someone has to drop out, someone else can take their seat. Or you can carry on from another device:
        if your phone's battery dies, or if you started the game on a computer (to upload a Common Game page,
        say) and want to play on your phone.
      </Typography>
      <Box component="ol" sx={{ m: 0, pl: 2.5, display: "grid", gap: 1 }}>
        <li>
          Ask anyone at the table for the join code (it's at the top of their board screen), then tap{" "}
          <strong>Join a game</strong> and type it.
        </li>
        <li>
          The game is already full, so you see who's playing. Pick whose seat you're taking (your own, if you're
          changing devices) and tap <strong>Join as replacement</strong>.
        </li>
        <li>
          Everyone at the table is asked whether to allow it; the first answer counts. Once someone allows it,
          you're in that seat with all its results so far, and the old device leaves the game.
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
          Matchpoints and nets are shown to one decimal: 95.4% nets 95.4 − 4.6 = +90.8. A zero decimal is left
          off, so 62.0% shows as 62%.
        </Typography>
      </Box>
      <Typography sx={{ mb: 1 }}>
        Tap the matchpoints on a board to see the field. At the top it works out your score: in the example,{" "}
        <strong>Matchpoints: 70% = (60 + 10) ÷ 100</strong>, then{" "}
        <strong>Net: +40 = 70 − 30</strong>. Below that is every score the field got, best for
        your side first, with your result highlighted. Under each score is the contract behind it, when the game
        file gives it. The <strong>Matchpoints</strong> column is the % you'd have got with that score, and{" "}
        <strong>Tables</strong> is how many tables got it, with their share of the field: 20 of 100 shows as 20
        (20%). A very small share shows as &lt;1%. Tap the ? beside a heading for a reminder.
      </Typography>
      <Typography sx={{ mb: 1 }}>
        The field also shows <strong>IMPs</strong> (International Match Points), the scoring used in team games.
        Matchpoints count how many tables you beat; IMPs measure by how much. Your score is compared with the
        field average, and the difference goes through a fixed scale that squeezes big swings: 20–40 points is 1
        IMP, 400 points is 9, and the most is 24. For example, if the field average for your side is −620 and you
        score +100, that's 720 points better, worth +12 IMPs. The running tally adds up both: the nets at the top, and your IMPs over all the boards when you tap it.
      </Typography>
      <Typography>
        New to duplicate scoring?{" "}
        <Link href={LEARN_MORE} target="_blank" rel="noopener noreferrer">
          Learn more about how it works
        </Link>
        .
      </Typography>

      <Heading>Put it on your home screen</Heading>
      <Typography sx={{ mb: 1 }}>
        Install the app and it opens like any other app, full screen, from its own icon. Until you do, your
        avatar menu (top right) has <strong>Install to home screen</strong>, which shows you how.
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

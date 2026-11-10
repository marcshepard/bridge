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
          <strong>Start a game:</strong> one person, the game's <strong>owner</strong>, imports the game: a PBN
          file, or a Common Game results page saved from your browser. They choose how you'll play the boards:
          with <strong>real cards</strong> (everyone needs their own deck) or <strong>online</strong> (no
          cards needed). They get a join code to share with the others.
        </li>
        <li>
          <strong>Join a game:</strong> the others type the code, or open the link they were sent.
        </li>
        <li>
          <strong>Someone without the app?</strong> In a real-cards game, the owner can tap{" "}
          <strong>Add a player without the app</strong> in the lobby and type their name. The app can't show
          them their cards, so they need their hands some other way, such as a printed hand record.
        </li>
        <li>
          <strong>Partners:</strong> once all four have joined, the owner taps their partner's name, or{" "}
          <strong>Let the app choose</strong> for random partners, then starts the game. Each screen then shows
          where everyone sits.
        </li>
        <li>
          <strong>Practice with bots</strong> to practise bidding and play on your own: you sit South, and bots
          take the other three seats. See <strong>Practice with bots</strong> below.
        </li>
        <li>
          <strong>Start demo game</strong> to see how it works on your own. You get a made-up game (the deals
          are real, but the other results and the commentary are invented), with three bots at the table (Bot 2,
          Bot 3 and Bot 4). Pick a partner, then for each board deal yourself your cards and enter any result
          you like, as the owner. It starts at board 9 of 36, to show that a game can start part-way through and
          wrap round.
        </li>
      </Box>

      <Heading>The owner runs the table</Heading>
      <Typography>
        Everyone's screen shows the same board. The owner enters each result, corrects it if needed, and moves
        the table on to the next board, so nobody gets ahead or left behind. Talk the board over first; the owner
        can then open the field and the analysis for everyone to see.
      </Typography>

      <Heading>Playing a board with real cards</Heading>
      <Box component="ol" sx={{ m: 0, pl: 2.5, display: "grid", gap: 1 }}>
        <li>
          At the top is the board: its number in the game it comes from, for example{" "}
          <strong>Board 7 · The Common Game 10/16/26</strong>. Tap the ⓘ to see where it comes in
          your game (board 1, if you started at board 7) and how many results from the original game it's scored
          against.
        </li>
        <li>
          Under it: your seat, the <strong>dealer</strong> (and who that is, for example{" "}
          <strong>East (Joe, on your right)</strong>), and who's <strong>vulnerable</strong>, for example{" "}
          <strong>N/S (you)</strong>, <strong>Both</strong> or <strong>None</strong>.
        </li>
        <li>
          Then your 13 cards, in big type, a suit per row (spades, hearts, clubs, diamonds, so the colours
          alternate), with your high-card points (HCP: ace 4, king 3, queen 2, jack 1). Take those cards from your
          deck, so nobody sees the other hands, then bid and play as normal.
        </li>
        <li>
          When the bidding is over, the owner taps <strong>Enter the contract</strong> (at the bottom of the
          screen): the contract and who's declaring (or <strong>Passed out</strong>, which ends the board). It shows
          on everyone's screen, for example <strong>Contract 4♠ by West (Ann, on your left)</strong>, so you can
          all keep it in mind during the play, and your cards re-sort with trumps first. The owner can tap{" "}
          <strong>Edit the contract</strong> if it's wrong.
        </li>
        <li>
          When the play is over, the owner taps <strong>Enter the result</strong>: how many tricks declarer took.
          Every screen then shows the result.
        </li>
        <li>
          The result card says what happened, for example <strong>2♣× by N, made</strong>, with two buttons
          under it: your <strong>Score</strong> (+180 N/S; tap it to see how it adds up) and your{" "}
          <strong>Matchpoints</strong> (83% N/S; tap it to see what the original pairs scored, and your net). Below are all
          four hands (on the <strong>Bidding</strong> tab, under the auction, when the board was played online), North at the top and South at the bottom, each headed with the seat and the player, for
          example <strong>West (Marc)</strong>. Trumps come first in each hand, then the other suits alternating
          colours. When the source has
          analysis for the board (<strong>Expert analysis</strong>, or just the <strong>Double dummy</strong>{" "}
          tricks), it's there too, closed until you tap it.
        </li>
        <li>
          The owner taps <strong>Correct</strong> beside the result to fix it, and <strong>Next board</strong> (at
          the bottom of the screen) to move everyone on. To correct an earlier board, the owner opens the running
          tally and taps that board's row. The running
          tally at the top (for example NS +140) adds up how far ahead or behind the field you are; anyone can tap
          it to see every board.
        </li>
        <li>
          If someone's phone goes to sleep or loses signal, their name is greyed out with a small no-signal icon
          (a cloud with a line through it) until they're back. A blip of a few seconds shows nothing. Tap the icon to see what it means. If it's yours, the same icon shows at the top, beside Help (with <strong>Reconnecting</strong> where there's room); the app
          reconnects by itself and catches up on anything you missed.
        </li>
      </Box>

      <Heading>Practice with bots</Heading>
      <Typography sx={{ mb: 1 }}>
        Practise on your own. You sit South, a bot is your partner, and bots are your opponents. Choose{" "}
        <strong>Bidding and play</strong> (you bid, then play the hand or defend; when your bot partner declares,
        you watch as dummy) or <strong>Bidding only</strong> (each board goes from the auction straight to its
        review).
      </Typography>
      <Box component="ol" sx={{ m: 0, pl: 2.5, display: "grid", gap: 1 }}>
        <li>
          On the first screen, tap <strong>Practice with bots</strong>. Choose <strong>Random deals</strong> (36
          boards dealt fresh for you), or <strong>Import a game</strong> (a PBN file or a saved Common Game page)
          to play boards that other people have played, and see how you'd have done against them.
        </li>
        <li>
          To make the bots bid the way you do, tap <strong>Configure bidding system</strong> and set your choices
          (your 1NT range, weak twos and so on). Then tap <strong>Start practice</strong>.
        </li>
        <li>
          Want to see how the bots would handle a hand? Turn on <strong>Bots bid for me</strong> (or{" "}
          <strong>Bots bid and play for me</strong>) on the bidding screen, and they take your seat too while you
          read why. It stays on for the rest of that practice until you turn it off.
        </li>
        <li>
          In <strong>Bidding and play</strong>, the result screen after each board opens on the{" "}
          <strong>Play</strong> tab (the play review); the <strong>Bidding</strong> tab has the bidding review, with
          the four hands under it. See <strong>The bidding review</strong> and{" "}
          <strong>The play review</strong> below.
        </li>
        <li>
          In <strong>Bidding only</strong>, when the auction ends the contract is scored as if everyone then played perfectly (double dummy): for
          example, if 4♠ by North takes 10 tricks with perfect play, it's scored as 4♠ made. When the game file
          doesn't include these trick counts (random deals and Common Game pages don't), your device works them
          out, which takes a moment.
        </li>
        <li>
          Tap <strong>Next board</strong> to go on. With an imported game, the running tally at the top adds up how
          you're doing against the original field, as in a game with people. Random deals have no field (nobody
          else has played them), so you see your scores but no matchpoints.
        </li>
      </Box>

      <Heading>The bidding review</Heading>
      <Typography sx={{ mb: 1 }}>
        After a board, the review shows the auction with every hand in view. Tap any bid to see:
      </Typography>
      <Box component="ul" sx={{ m: 0, pl: 2.5, display: "grid", gap: 1 }}>
        <li>
          <strong>What it means</strong> in the system, for example <strong>1NT: 15–17 HCP, balanced</strong>.
        </li>
        <li>
          <strong>Why the bot bid it</strong>, from its hand, for example{" "}
          <strong>16 HCP and 4-3-3-3: balanced, in the 1NT range</strong>.
        </li>
        <li>
          For your own bids: whether the bot would have bid the same, and if not, what it would have bid and why.
          For example, you raise partner's 1♥ to 2♥ with four hearts, a singleton and 9 HCP; the bot would have
          bid 3♥, because with four trumps the singleton is worth 3 more points, making 12: a limit raise.
        </li>
        <li>
          <strong>What the bidding had shown before this</strong>, for example{" "}
          <strong>North (your partner): 15–17 HCP · balanced</strong>: what you could have known at that point.
        </li>
      </Box>
      <Typography sx={{ mt: 1 }}>
        Some bids carry a small mark: <strong>≠</strong> for a bid of yours the bot would have made differently,{" "}
        <strong>?</strong> for a hard call, and <strong>!</strong> for a position no rule covers yet. A hard call is
        one the rules don't settle, typically whether to compete, double or pass late in a contested auction. The
        bot settles it by simulation: it deals many hands that fit what the bidding has shown, works out how each
        choice would score with perfect play, and picks the one that does best at matchpoints. Tap the bid to see
        the figures, for example <strong>Double: 58% of the matchpoints, Pass: 42%</strong> over 60 deals. Use <strong>Previous bid</strong>{" "}
        and <strong>Next bid</strong> to step through the auction. In a game with other people, only your own bids
        are compared with the bot's. Tap <strong>bot's evaluation</strong> above the auction to see the card each side bid by in this game.
      </Typography>

      <Heading>The play review</Heading>
      <Typography sx={{ mb: 1 }}>
        After a board played online, the <strong>Play</strong> tab under the result goes through the play a trick at
        a time. Tap a trick's number to see it: all four hands face up as they were when the trick started, you at the
        bottom, and the trick's cards in the middle (the first card says <strong>led</strong>, and the line under it
        says who led and who won). Tap a card in the trick to see what it was, under the table:
      </Typography>
      <Box component="ul" sx={{ m: 0, pl: 2.5, display: "grid", gap: 1 }}>
        <li>
          <strong>For your cards</strong> (and dummy's, when you were declarer): how it compares with the other
          cards you could have played. The review deals the hands you couldn't see many times, in ways that fit the
          bidding and the cards played so far, and works out which card does best with perfect play from there on
          each deal. So it judges your card on what you could know, not on how the cards happened to lie.
        </li>
        <li>
          <strong>For a bot's card</strong>: why the bot played it.
        </li>
        <li>
          Other people's cards aren't explained: feedback is only for the player it's about.
        </li>
      </Box>
      <Typography sx={{ mt: 1 }}>
        Your cards can carry a mark, on the card and on its trick's number: <strong>✗</strong> a mistake, when another
        card was best on at least 10% more of the deals; <strong>≈</strong> a close call, when another card was a
        little better (1% to 10% more); and <strong>?</strong> unlucky, when your card was right on the odds but cost
        a trick on the actual deal. For example, with nine trumps missing the queen, playing for the drop works on
        slightly more deals than the finesse: finessing is a close call even when it wins, and the drop is unlucky
        when the finesse would have worked. A mistake that happened to work says so ("it worked this time"). Tap{" "}
        <strong>Details</strong> for the figures: how often each card was best across the deals, and what each would
        have taken on the actual deal with perfect play. The review takes a moment: the marks appear as they're
        worked out.
      </Typography>

      <Heading>Playing online</Heading>
      <Typography sx={{ mb: 1 }}>
        In a game played online, there are no cards or bidding boxes: you bid and play each board on your
        phones, tablets or computers.
      </Typography>
      <Box component="ol" sx={{ m: 0, pl: 2.5, display: "grid", gap: 1 }}>
        <li>
          Each board starts with the auction as soon as the table gets to it. When the play is over, everyone sees
          the result and the four hands, as with real cards, and the owner taps <strong>Next board</strong>.
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
          tap the contract at the top (it says <strong>auction</strong> under it) to see the auction again, and tap
          any bid in it to see what it means.
        </li>
        <li>
          In a game with bots (robot players), the bots bid and play by themselves, after a short pause so you
          can follow. They bid Standard American Yellow Card (SAYC), the system most club players learn.
        </li>
        <li>
          <strong>How the bots play:</strong> before each card, a bot deals the hands it can't see many times, in
          ways that fit the bidding and the cards played so far, and works out which card does best with perfect
          play on most of those deals. It leads and signals by its side's agreements (on the Bidding system page,
          under <strong>Leads and signals</strong>). When you claim, a bot checks your claim the same way and
          refuses it if it could fail; when the rest of the tricks are surely its side's, a bot claims.
        </li>
        <li>
          <strong>Your bidding system:</strong> tap your initial at the top right, then <strong>Bidding system</strong> (or{" "}
          <strong>Configure bidding system</strong> when you start a practice),
          to set the choices SAYC leaves open the way you play them: your 1NT range, weak twos, Jacoby 2NT, how far
          negative doubles go, and so on. Your bot partner bids the same, and your bids are compared with it in the
          review. Your choices are kept on this device and go with you into each game you start or join; a game keeps
          the card it started with. Bots with nobody on their side bid SAYC as it comes.
        </li>
        <li>
          After the board, the tabs under the result have the reviews: <strong>Bidding</strong> goes through the
          auction (tap any bid to see what it means, and why the bot made it), and <strong>Play</strong> through the
          cards, with how yours compared. See <strong>The bidding review</strong> and <strong>The play review</strong>{" "}
          above.
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
        if your phone's battery dies, or if you started the game on a computer (to import a Common Game page,
        say) and want to play on your phone.
      </Typography>
      <Box component="ol" sx={{ m: 0, pl: 2.5, display: "grid", gap: 1 }}>
        <li>
          Ask anyone at the table for the join code (it's at the top of their board screen), then tap{" "}
          <strong>Join a game</strong> and type it.
        </li>
        <li>
          If the game is already full, you see who's playing. Pick whose seat you're taking (your own, if you're
          changing devices) and tap <strong>Join as replacement</strong>. If you're the owner and the game hasn't
          started yet, tap <strong>Join as</strong> your name <strong>(owner)</strong>.
        </li>
        <li>
          Everyone at the table is asked whether to allow it; the first answer counts. If nobody's connected to
          answer, you're let in straight away. You're then in that seat with all its results so far (and, for the
          owner's seat, you're the owner), and the old device leaves the game.
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
        avatar menu (top right) has <strong>Install to home screen</strong>, which shows you how. It's optional:
        the app works in your browser too, and the ✕ on the install banner hides the banner on that device.
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

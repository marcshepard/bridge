// How the app works, for someone who has never used it (or played duplicate). Opened from the help
// buttons. Keep it in step with what the app actually does (see AGENTS.md).

import { Box, Link, Typography } from "@mui/material";
import type { ReactNode } from "react";
import { SheetDialog } from "../controls/SheetDialog";
import { FEEDBACK_EMAIL } from "../feedback";
import { SafariShareStep } from "./SafariShareStep";

const LEARN_MORE = "https://en.wikipedia.org/wiki/Duplicate_bridge#Scoring";

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
          <strong>Short of players?</strong> In an online game, the owner can tap <strong>Add a bot</strong> in
          the lobby for each empty place. The owner's device bids and plays for the bots, so keep it open while
          you play. Changed your mind? Tap <strong>Remove</strong> beside the bot. If a friend turns up later,
          they can join with the code and take over a bot's seat.
        </li>
        <li>
          <strong>Seats:</strong> once all four players are in the lobby, the owner sees a seat next to each
          name. The seats start out random. To match where people are sitting, change a player's seat in the
          list. For example, choosing East for North swaps those two players. Then tap <strong>Start game</strong>.
        </li>
        <li>
          <strong>Practice with bots</strong> to practise bidding and play on your own: you sit South, and bots
          take the other three seats. See <strong>Practice with bots</strong> below.
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
          <strong>We (N/S)</strong> (your side), <strong>They (E/W)</strong>, <strong>Both</strong> or <strong>None</strong>.
        </li>
        <li>
          Then your 13 cards, in big type, a suit per row (spades, hearts, clubs, diamonds, so the colours
          alternate), with your high-card points (HCP: ace 4, king 3, queen 2, jack 1). Take those cards from your
          deck, so nobody sees the other hands, then bid and play as normal.
        </li>
        <li>
          When the bidding is over, the owner taps <strong>Enter the contract</strong> (at the bottom of the
          screen): the contract and who's declaring: each direction shows who's sitting there, for example North with{" "}
          <strong>Partner · Joe</strong> under it (or <strong>Bot</strong> for a bot). Or tap{" "}
          <strong>Passed out</strong>, which ends the board. It shows
          on everyone's screen, for example <strong>Contract 4♠ by West (Ann, on your left)</strong>, so you can
          all keep it in mind during the play, and your cards re-sort with trumps first. The owner can tap{" "}
          <strong>Edit the contract</strong> if it's wrong.
        </li>
        <li>
          When the play is over, the owner taps <strong>Enter the result</strong>: how many tricks declarer took.
          Every screen then shows the result.
        </li>
        <li>
          If the table can't finish a board, the owner taps <strong>Skip board</strong> at the bottom and
          confirms. Everyone moves to the next board if there is one. The skipped board adds nothing to
          either side's score and is left out of the tally.
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
          it to see every board with a result.
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
        you play its contract for it) or <strong>Bidding only</strong> (each board goes from the auction straight to its
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
          A raise may show points with a trump fit. Those include extra value for short suits. For example,
          with four trumps, 9 HCP and a singleton can count as 12 points for the raise.
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
      <Typography sx={{ mt: 1 }}>
        One exception: an opening lead from ace–king against a suit contract is never a close call. Cashing a top card
        lets you see dummy before you choose what to do next, which the deals can't measure. It's only marked as a
        mistake when another lead was best on more than 10% more of the deals.
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
          under the dealer; each column says who that player is to you, such as <strong>North (partner)</strong>,
          and a vulnerable side's names are in red. The shaded, outlined box shows whose bid is next. Your hand is
          under the auction. While someone else bids, the line below your hand says whose bid it is, for example{" "}
          <strong>East's bid — Neal, on your left</strong>. When it's your turn, the bidding box appears there: tap a
          level and then a suit or NT, or tap <strong>Pass</strong> (shaded green), or <strong>X</strong> (double) or{" "}
          <strong>XX</strong> (redouble), shaded red. Only the bids you can make are shown: a bid has to be higher than
          the last one, you can only double an opponent's bid, and only redouble an opponent's double. For
          example, after 2♥ the levels start at 2, and at the 2 level only ♠ and NT are left. The button at the bottom
          of the screen (it's always there on your turn) then says what you picked: tap <strong>Submit 3♥</strong> (or{" "}
          <strong>Submit Pass</strong>, and so on) to make it. A bid can't be taken back. Just above the button is what
          your bid would tell partner, by your side's bidding system, for example{" "}
          <strong>3♥: invitational raise</strong>. Pick another bid to see what that one means.
          With <strong>Bot hints</strong> on (see below), it also says <strong>✓ The bot would bid this too</strong>{" "}
          when the bot would make the same bid with your hand.
        </li>
        <li>
          <strong>Bidding with one tap:</strong> tap your initial at the top right and turn off{" "}
          <strong>Confirm bids</strong>. Then a bid goes as soon as you tap it: a level and then a suit or NT, or{" "}
          <strong>Pass</strong>, <strong>X</strong> or <strong>XX</strong>, with no Submit. It's faster, but you don't
          see what the bid means first, and a slip of the finger can't be undone. With Bot hints on, you're told
          afterwards what the bot would have bid, until the next player bids. The <strong>?</strong> beside <strong>Your bid</strong> explains the bidding settings.
        </li>
        <li>
          <strong>What a bid means:</strong> tap any bid in the auction, partner's, an opponent's or your own. What it
          shows, by that side's bidding system, appears just under the auction, for example{" "}
          <strong>What West's 1♥ means</strong>, with what the bidding had shown about each hand before it, so you
          can still see the auction and your hand. Tap the bid again, or
          the <strong>×</strong>, to close it, or tap another bid to see that one.
        </li>
        <li>
          The auction ends after three passes in a row following a bid. The contract goes in for everyone, and the
          card play starts. If all four pass first, the board is passed out and scored as that. During the play,
          tap the contract at the top left to see the auction again, and tap
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
          the card it started with. Each side bids by one card: the owner's on the owner's side, otherwise the first
          player's to join that side. So if your partner's card is used, your bids are read by theirs. To see whose
          card each side bids by, open the bidding review after a board and tap <strong>bot's evaluation</strong>.
          Bots with nobody on their side bid SAYC as it comes.
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
          <strong>Your turn</strong> in bold green, with a small pulsing dot beside it. When you're declarer and it's
          dummy's turn, it says <strong>Dummy's turn</strong> the same way: play a card from dummy. Whoever plays
          next, their box is shaded light green with a thicker green border, and the same pulsing dot is beside
          their name.
        </li>
        <li>
          When your partner is a bot and it declares, you play the contract for it: its cards are at the top, marked{" "}
          <strong>North (bot), declarer: you're playing these cards</strong>, and your own cards at the bottom are
          dummy. The green <strong>Your turn</strong> says which hand is to play, for example <strong>Your turn (North)</strong> or{" "}
          <strong>Your turn (dummy)</strong>. You can claim, and answer a claim, for it too. The other players see{" "}
          <strong>North's turn</strong> with your name, so they know who they're waiting for.
        </li>
        <li>
          To play a card, either:
          <ul>
            <li>
              <strong>Swipe it towards the table</strong> (up from your hand, down from dummy at the top) and it's played
              at once. With a mouse, drag it. Let go
              before it's gone far and it drops back, unplayed.
            </li>
            <li>
              Or <strong>tap it</strong> to pick it (it lifts up), then tap <strong>Play</strong> at the bottom of the screen. The
              button says which card, for example <strong>Play 7♠</strong>, or <strong>Play 7♠ from dummy</strong>.
              Changed your mind? Tap another card first. This way, Bot hints can tell you about the card before you play it.
            </li>
          </ul>
          Cards you can't play right now are greyed out: you have to follow suit when you can. Your last card plays itself
          after a moment. Before that, when only one card can be played (your only card in the suit led), it's picked
          for you, but you still tap <strong>Play</strong>: if it went by itself, everyone would know you had no
          choice. A card can't be taken
          back once it's played. The <strong>?</strong> beside <strong>Play</strong> sums this up.
        </li>
        <li>
          The other players' boxes show their name, how many cards they have left, and that many cards face down.
        </li>
        <li>
          After the opening lead, dummy's cards are shown to everyone. Declarer plays dummy's cards as well as
          their own; dummy just watches, so dummy's own cards are shown one suit per line, easy to read. If you're dummy, you can tap <strong>Show hand</strong> at the top right of
          partner's box to look at declarer's cards (and <strong>Hide hand</strong> to put them away). Strict rules don't allow
          this, but in a friendly game it does no harm: dummy has no cards to play.
        </li>
        <li>
          When a trick is complete, it stays face up in the middle for three seconds (less if someone plays
          to the next trick), then goes face down onto a small pile of four card backs under the table: the last
          trick. Want another look? Tap the pile (<strong>← Tap to review last trick</strong>), at any time, dummy
          too: the last trick turns face up in the middle, and the cards of the trick being played are hidden while
          you look. Tap the pile again to go back. While you're looking back you can't pick or play a card (or
          claim), so you never play without seeing the trick in front of you; if it becomes your turn, a banner says{" "}
          <strong>It's your turn to play to trick 3. Tap here to close trick 2.</strong> Tap the banner to go back. This is
          friendlier than tournament rules, where you can only ask to see the last trick before your side plays to
          the next one.
        </li>
        <li>
          <strong>Bot hints:</strong> tap your initial at the top right and turn on <strong>Bot hints</strong> (it's
          off to start with, and only there during a game played online or a practice). Then, when the bid or card
          you've picked is the one the bot would choose with your cards, it says{" "}
          <strong>✓ The bot would bid this too</strong> (or <strong>play</strong>). It doesn't tell you the bot's
          choice: try a few and see which gets the tick. (With Confirm bids off, it tells you after your bid what the
          bot would have bid. A card you swipe, or one that plays itself, gets no hint.)
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

      <Heading>Going back to the first screen</Heading>
      <Typography sx={{ mb: 1 }}>
        Tap the ♠ <strong>Bridge Replay</strong> at the top left to go to the first screen, for example to start
        another game or practise. Your game is kept: a note at the top of the first screen says which game it is,
        its join code, the board you were on, who else is playing and when you were last there. Tap{" "}
        <strong>Resume</strong> to return to your seat, or <strong>✕</strong> to put the game aside (you can still
        go back with its join code). If you open the app again within 6 hours, it goes straight back into your game;
        after longer, it opens on the first screen with that note. Starting or joining another game makes that one
        your game instead. To leave a game from inside it, tap your initial at the top right, then{" "}
        <strong>Leave game</strong>; once play has started you can still go back to your seat with its join code.
      </Typography>

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
        <strong>Net: +40 = 70 − 30</strong>. Below that is every score the field got, the
        most common first (the way The Common Game lists them), with your result highlighted. Under each score is the contract behind it, when the game
        file gives it. The <strong>Matchpoints</strong> column is the % you'd have got with that score, and{" "}
        <strong>Tables</strong> is how many tables got it, with their share of the field: 20 of 100 shows as 20
        (20%). A very small share shows as &lt;1%. Tap <strong>Score</strong> to see the best scores for your side
        first, or <strong>Tables</strong> to go back to the most common first. Tap the ? beside a heading for a reminder.
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
          <strong>iPhone or iPad (Safari).</strong> <SafariShareStep /> Tap <strong>Add to Home Screen</strong>.
          If you see <strong>Open as Web App</strong>, turn it on. Then tap <strong>Add</strong>.
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

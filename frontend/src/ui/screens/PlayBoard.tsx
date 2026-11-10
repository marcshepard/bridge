// One board as you see it at the table. The game's owner runs it: they enter the result and move
// everyone on, and every device shows the same board.
//
// Both screens start the same way: the board header (which game and board, the dealer, who's
// vulnerable). Before the result: your seat, and your 13 cards in big type to deal from. After it:
// a result card (the owner can correct it; the score and matchpoints open their detail), and all
// four hands in a standard diagram, South at the bottom. The main action (or who it's waiting for)
// stays pinned at the bottom of the screen.

import { Box, Button, Paper, Stack, Typography } from "@mui/material";
import { formatTableResult } from "../../core/contract";
import { formatScore } from "../../core/scoring";
import type { BoardComparison } from "../../core/compare";
import { hcp } from "../../core/deal";
import type { Call } from "../../core/auction";
import type { Card, Claim } from "../../core/play";
import { type Contract, type Hand as HandT, type Seat, SEATS, SEAT_NAMES, directionOf } from "../../core/types";
import type { Board } from "../../providers/types";
import type { TableSystems } from "../../core/bidding/system";
import { BiddingReview } from "../components/BiddingReview";
import { PlayReview } from "../components/PlayReview";
import { BoardHeader } from "../components/BoardHeader";
import { Hand } from "../components/Hand";
import { ContractText, ResultText, ScoreText } from "../controls/BridgeText";
import { Compass } from "../controls/Compass";
import { DetailButton } from "../controls/DetailButton";
import { EditButton } from "../controls/EditButton";
import { PlayerName } from "../controls/PlayerName";
import { Panel, Screen, Section } from "../controls/Layout";
import { type TabPanel, TabPanels } from "../controls/TabPanels";
import { ScoreChip, type Tone } from "../controls/ScoreChip";
import { formatJoinCode, netParts, seatAndPlayer, vulnerableShort } from "../labels";
import { BidHand } from "./BidHand";
import { PlayHand } from "./PlayHand";

interface Props {
  /** The game's join code, so anyone at the table can read it out to someone rejoining. */
  code: string;
  /** The game's title, e.g. "The Common Game 10/16/26". */
  title: string;
  board: Board;
  /**
   * Where this board comes in the game you're playing, from 1. It differs from `board.number` (the
   * original game's) when you started part-way through, and then both are shown.
   */
  position: number;
  seat: Seat;
  names: Record<Seat, string>;
  /** Players with no live connection right now: greyed out, with a no-signal icon. */
  away: Record<Seat, boolean>;
  tally: { label: string; tone: Tone; ariaLabel: string };
  /** The table's result compared with the field, once the owner has entered it. */
  comparison: BoardComparison | null;
  /** The contract, once entered and until the result is. */
  contract: { contract: Contract; declarer: Seat } | null;
  /** You're the game's owner: you enter the result and move the table on. */
  isOwner: boolean;
  /** The owner's name, for "Waiting for Marc…". */
  owner: string;
  onTally: () => void;
  onBoardInfo: () => void;
  /** Enter the result (the owner). */
  onEnterResult: () => void;
  /** Enter or change the contract, once the bidding is over (the owner), so everyone sees it during the play. */
  onEnterContract: () => void;
  /** Start the board on the devices by hand (the owner, in a game played on the devices). */
  onStartPlay?: () => void;
  /** While the board is being bid on the devices: the auction takes over the page. */
  bidding: {
    /** Seats held by bots, and the seats this device makes the bots' calls for. */
    bots: Seat[];
    autoSeats: Seat[];
    /** The card each side bids by. */
    systems: TableSystems;
    /** Bidding practice: the "Bots bid for me" switch. */
    watch?: { on: boolean; onChange: (on: boolean) => void; label?: string };
    calls: Call[];
    onCall: (seq: number, call: Call) => Promise<void>;
  } | null;
  /**
   * Bidding practice, a contract the game file can't score: "working" while double dummy works it
   * out (on the owner's device), "failed" if it can't.
   */
  scoring?: "working" | "failed" | null;
  /**
   * The board's auction, once it's over, for the bidding review. In bidding practice (`inline`) the
   * review is part of the result screen; otherwise it opens from a button.
   */
  review: {
    calls: Call[];
    bots: Seat[];
    systems: TableSystems;
    inline: boolean;
    onSystem: () => void;
  } | null;
  /**
   * The board's cards, once its play on the devices is over, for the play review (a tab on the
   * result screen, beside Bidding and Hands).
   */
  playReview: {
    calls: Call[];
    cards: Card[];
    bots: Seat[];
    systems: TableSystems;
  } | null;
  /** While the cards are being played on the devices: the play table takes over the page. */
  play: {
    /** Seats held by bots, and whether this device plays their cards. */
    bots: Seat[];
    playsForBots: boolean;
    /** The auction, when the board was bid on the devices. */
    calls: Call[];
    /** The card each side bids and signals by. */
    systems: TableSystems;
    cards: Card[];
    claim: Claim | null;
    onPlay: (seq: number, card: Card) => Promise<void>;
    onClaim: (tricks: number, seat?: Seat) => Promise<void>;
    onAnswerClaim: (accept: boolean, seat?: Seat) => Promise<void>;
    onWithdrawClaim: () => Promise<void>;
  } | null;
  /** Correct the result (the owner only; without it the result is plain text). */
  onCorrect?: () => void;
  onBreakdown: () => void;
  onField: () => void;
  /** The board the table goes to next (null: this was the last). */
  next: number | null;
  /**
   * The owner is looking back at an earlier board (from the tally): instead of moving on, the
   * bottom bar takes them back to the table's board.
   */
  backTo: { board: number; onBack: () => void } | null;
  /** Move the table on (the owner only). */
  onNext?: () => void;
}

/**
 * A seat in the hand diagram: a heading strip, "West (Marc)", then the cards in suit rows (a long
 * suit wraps, its next line under its first card).
 */
function SeatHand({
  seat,
  name,
  away,
  hand,
  trump,
}: {
  seat: Seat;
  name: string;
  away: boolean;
  hand: HandT;
  trump: Contract["strain"] | null;
}) {
  return (
    <>
      <Typography
        variant="subtitle2"
        component="h3"
        noWrap
        sx={{ px: 1, py: 0.5, bgcolor: "action.hover", borderBottom: 1, borderColor: "divider" }}
      >
        {SEAT_NAMES[seat]} <PlayerName name={`(${name})`} away={away} />
      </Typography>
      {/* Centred as a block, with the suits lined up on the left inside it. */}
      <Box sx={{ width: "fit-content", maxWidth: 1, mx: "auto", px: 1, py: 1 }}>
        <Hand hand={hand} trump={trump} />
      </Box>
    </>
  );
}

export function PlayBoard(p: Props) {
  const { board, seat, comparison: c } = p;
  const dir = directionOf(seat);
  const sideLabel = dir === "NS" ? "N/S" : "E/W";

  const top = (
    <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 2 }}>
      <Typography variant="body1" color="text.secondary" sx={{ flex: 1 }}>
        Join code <strong className="num">{formatJoinCode(p.code)}</strong>
      </Typography>
      <ScoreChip label={p.tally.label} tone={p.tally.tone} onClick={p.onTally} ariaLabel={p.tally.ariaLabel} />
    </Stack>
  );
  const setup: [string, React.ReactNode][] = [
    ["Dealer", seatAndPlayer(seat, board.dealer, p.names[board.dealer])],
    ["Vulnerable", vulnerableShort(seat, board.vul)],
  ];

  // While the board is bid or its cards are played on screen (and for a moment after, showing how
  // it went), the auction or the play table takes the place of everything below the top row: the
  // table plays this board together.
  if (p.bidding) {
    return (
      <Screen>
        {top}
        <BidHand
          board={board}
          seat={seat}
          names={p.names}
          away={p.away}
          bots={p.bidding.bots}
          autoSeats={p.bidding.autoSeats}
          systems={p.bidding.systems}
          watch={p.bidding.watch}
          calls={p.bidding.calls}
          onCall={p.bidding.onCall}
        />
      </Screen>
    );
  }
  if (p.play && p.contract) {
    return (
      <Screen>
        {top}
        <PlayHand
          board={board}
          seat={seat}
          contract={p.contract}
          names={p.names}
          away={p.away}
          bots={p.play.bots}
          playsForBots={p.play.playsForBots}
          calls={p.play.calls}
          systems={p.play.systems}
          cards={p.play.cards}
          claim={p.play.claim}
          onPlay={p.play.onPlay}
          onClaim={p.play.onClaim}
          onAnswerClaim={p.play.onAnswerClaim}
          onWithdrawClaim={p.play.onWithdrawClaim}
        />
      </Screen>
    );
  }

  // What comes next, at the bottom of the screen, however long the hands are.
  const nextFooter = p.backTo ? (
    <Button variant="contained" size="large" fullWidth onClick={p.backTo.onBack}>
      Back to board {p.backTo.board}
    </Button>
  ) : p.next === null ? (
    <Typography color="text.secondary">That was the last board.</Typography>
  ) : p.onNext ? (
    <Button variant="contained" size="large" fullWidth onClick={p.onNext}>
      Next board
    </Button>
  ) : (
    <Typography color="text.secondary" role="status">
      Waiting for {p.owner} to start the next board…
    </Typography>
  );
  const allHands = (trump: Contract["strain"] | null) => {
    const seats = Object.fromEntries(
      SEATS.map((s) => [s, <SeatHand key={s} seat={s} name={p.names[s]} away={p.away[s]} hand={board.hands[s]} trump={trump} />]),
    ) as Record<Seat, React.ReactNode>;
    return <Compass me={seat} bottom="S" seats={seats} label="All four hands" />;
  };
  const biddingReview = p.review && (
    <BiddingReview board={board} calls={p.review.calls} seat={seat} names={p.names} bots={p.review.bots} systems={p.review.systems} onSystem={p.review.onSystem} />
  );
  /**
   * Under the result: the bidding review with the four hands under it (you want both together), and
   * the play review (it has its own hands), as tabs, so a phone needn't scroll. Without a bidding
   * review it's just the hands. Practice with a play opens on Play; otherwise, Bidding.
   */
  const resultTabs = (trump: Contract["strain"] | null, playReview: React.ReactNode) => {
    const bidding = biddingReview ? (
      <>
        {biddingReview}
        <Box sx={{ mt: 2 }}>{allHands(trump)}</Box>
      </>
    ) : (
      allHands(trump)
    );
    if (!playReview) return bidding;
    const tabs: TabPanel[] = [
      { id: "bidding", label: biddingReview ? "Bidding" : "Hands", content: bidding },
      { id: "play", label: "Play", content: playReview },
    ];
    return <TabPanels tabs={tabs} initial={p.review?.inline ? "play" : "bidding"} label="The board after play" />;
  };

  // Bidding practice on a game file without double dummy: the auction's contract, unscored.
  if (!c && p.review?.inline && p.contract) {
    return (
      <Screen footer={nextFooter}>
        {top}
        <BoardHeader title={p.title} board={board.number} onInfo={p.onBoardInfo} rows={setup} />
        <Paper component="section" aria-label="Result" variant="outlined" sx={{ p: 1.5, mb: 1.5 }}>
          <Typography variant="caption" component="p" color="text.secondary">
            Contract
          </Typography>
          <Typography variant="h6" component="p">
            <ContractText contract={p.contract.contract} /> by {SEAT_NAMES[p.contract.declarer]}
          </Typography>
          <Typography variant="body2" color="text.secondary" role="status">
            {p.scoring === "working"
              ? "Working out the score: the tricks this contract makes with perfect play (double dummy)…"
              : "Not scored: this game file has no double-dummy tricks, and they couldn't be worked out on this device."}
          </Typography>
        </Paper>
        {resultTabs(p.contract.contract.strain, null)}
      </Screen>
    );
  }

  // Before the result: what you need to deal and bid, and your cards, big.
  if (!c) {
    // The owner's buttons, or what everyone else is waiting for, at the bottom of the screen.
    const footer = p.isOwner ? (
      p.onStartPlay ? (
        <Button variant="contained" size="large" fullWidth onClick={p.onStartPlay}>
          Play online
        </Button>
      ) : (
        // The contract after the bidding (so everyone sees it during the play), then the result
        // after the play: whichever is next is the main button.
        <Stack direction="row" spacing={1}>
          <Button variant={p.contract ? "outlined" : "contained"} size="large" fullWidth onClick={p.onEnterContract}>
            {p.contract ? "Edit the contract" : "Enter the contract"}
          </Button>
          <Button
            variant={p.contract ? "contained" : "outlined"}
            size="large"
            fullWidth
            disabled={!p.contract}
            onClick={p.onEnterResult}
          >
            Enter the result
          </Button>
        </Stack>
      )
    ) : (
      <Typography color="text.secondary" role="status">
        {p.contract
          ? `${p.owner} will enter the result once the play is over.`
          : `${p.owner} will enter the contract once the bidding is over.`}
      </Typography>
    );
    return (
      <Screen footer={footer}>
        {top}
        <BoardHeader
          title={p.title}
          board={board.number}
          onInfo={p.onBoardInfo}
          stacked
          rows={[
            ["You", SEAT_NAMES[seat]],
            ...setup,
            ...(p.contract
              ? ([
                  [
                    "Contract",
                    <>
                      <ContractText contract={p.contract.contract} /> by{" "}
                      {seatAndPlayer(seat, p.contract.declarer, p.names[p.contract.declarer])}
                    </>,
                  ],
                ] as [string, React.ReactNode][])
              : []),
          ]}
        />
        <Section title={`Your hand (${hcp(board.hands[seat])} HCP)`} id="your-hand" tight>
          {/* A suit per row in big type, for reading at arm's length while sorting real cards. */}
          <Panel>
            <Hand hand={board.hands[seat]} large trump={p.contract?.contract.strain ?? null} />
          </Panel>
        </Section>
      </Screen>
    );
  }

  // After the result: the result card (what happened, and how it scored), then all four hands.
  const trump = c.ours.result.contract?.strain ?? null;
  const played = c.ours.result.contract && c.ours.result.declarer ? { contract: c.ours.result.contract, declarer: c.ours.result.declarer } : null;
  const playReviewBody = p.playReview && played && (
    <PlayReview
      board={board}
      contract={played}
      calls={p.playReview.calls}
      cards={p.playReview.cards}
      seat={seat}
      names={p.names}
      bots={p.playReview.bots}
      systems={p.playReview.systems}
      tricks={c.ours.result.tricks}
    />
  );
  const mp = c.mpPct === null ? null : netParts(c.mpPct);

  return (
    <Screen footer={nextFooter}>
      {top}
      <BoardHeader title={p.title} board={board.number} onInfo={p.onBoardInfo} rows={setup} />

      <Paper component="section" aria-label="Result" variant="outlined" sx={{ p: 1.5, mb: 1.5 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="caption" component="p" color="text.secondary">
              Result
            </Typography>
            <Typography variant="h6" component="p">
              <ResultText result={c.ours.result} />
            </Typography>
          </Box>
          {p.onCorrect && (
            <EditButton onClick={p.onCorrect} ariaLabel={`${formatTableResult(c.ours.result)}. Correct the result`}>
              Correct
            </EditButton>
          )}
        </Stack>
        <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, mt: 1 }}>
          <DetailButton
            label="Score"
            onClick={p.onBreakdown}
            ariaLabel={`Score ${formatScore(c.ourScore)} ${sideLabel}. Show how it adds up`}
          >
            <ScoreText score={c.ourScore} /> {sideLabel}
          </DetailButton>
          {mp ? (
            <DetailButton
              label="Matchpoints"
              onClick={p.onField}
              ariaLabel={`${mp.pct} matchpoints for ${sideLabel}. Show the field`}
            >
              <Box component="span" sx={{ color: c.mpPct! < 50 ? "error.main" : "primary.main" }}>
                {mp.pct}
              </Box>{" "}
              {sideLabel}
            </DetailButton>
          ) : (
            <Typography variant="body2" color="text.secondary" sx={{ alignSelf: "center" }}>
              No field results to compare with, so no matchpoints.
            </Typography>
          )}
        </Box>
      </Paper>

      {resultTabs(trump, playReviewBody)}
    </Screen>
  );
}

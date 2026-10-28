// One board as you see it at the table. Before the result: who sits where, the dealer and
// vulnerability, your 13 cards to deal from, and the contract once the bidding is over (so everyone
// can see it during the play). After it: the result (entered by anyone at the
// table), your score, your matchpoints and net, and all four hands in their seats round the table.

import { Box, Button, Chip, Stack, Typography } from "@mui/material";
import { formatContract, formatTableResult } from "../../core/contract";
import { formatScore } from "../../core/scoring";
import { type ReactNode, useState } from "react";
import type { BoardComparison } from "../../core/compare";
import { hcp } from "../../core/deal";
import { type Contract, type Hand as HandT, type Seat, SEATS, SEAT_NAMES, directionOf, isVulnerable } from "../../core/types";
import type { Board } from "../../providers/types";
import { Hand, HandTiles } from "../components/Hand";
import { ContractText, ResultText, ScoreText } from "../controls/BridgeText";
import { Compass } from "../controls/Compass";
import { PlayerName } from "../controls/PlayerName";
import { Panel, Screen, Section } from "../controls/Layout";
import { ScoreChip, type Tone } from "../controls/ScoreChip";
import { formatJoinCode, netParts } from "../labels";

interface Props {
  /** The game's join code, so anyone at the table can read it out to someone rejoining. */
  code: string;
  board: Board;
  /**
   * Where this board comes in the game you're playing, from 1. It differs from `board.number` (the
   * original game's) when you started part-way through; the board details dialog shows both.
   */
  position: number;
  seat: Seat;
  names: Record<Seat, string>;
  /** Players with no live connection right now: greyed out, with a no-signal icon. */
  away: Record<Seat, boolean>;
  /** How many boards the game has. */
  total: number;
  tally: { label: string; tone: Tone; ariaLabel: string };
  /** The table's result compared with the field, once someone has entered it. */
  comparison: BoardComparison | null;
  /** The contract, once entered and until the result is. */
  contract: { contract: Contract; declarer: Seat } | null;
  /** Who entered the result, or the contract while that's all there is. */
  enteredBy: string | null;
  onTally: () => void;
  onBoardInfo: () => void;
  onEnterContract: () => void;
  onEnterResult: () => void;
  onCorrect: () => void;
  onBreakdown: () => void;
  onField: () => void;
  onAnalysis: () => void;
  onPrev: (() => void) | null;
  onNext: (() => void) | null;
}

/**
 * A seat on the compass: the player's name, plus Dealer and Vulnerable when they apply. Once the
 * board is over, `hand` adds the seat's cards, so the table shows the deal.
 */
function SeatLabel({
  name,
  dealer,
  vul,
  away,
  hand,
}: {
  name: string;
  dealer: boolean;
  vul: boolean;
  away: boolean;
  hand?: HandT;
}) {
  return (
    <>
      <PlayerName name={name} away={away} />
      {(dealer || vul) && (
        <Stack direction="row" spacing={0.5} useFlexGap sx={{ justifyContent: "center", flexWrap: "wrap", mt: 0.5 }}>
          {dealer && <Chip size="small" label="Dealer" />}
          {vul && <Chip size="small" color="error" label="Vulnerable" />}
        </Stack>
      )}
      {hand && (
        // On its own line under the name, centred as a block, with the suits lined up on the left inside it.
        <Box sx={{ width: "fit-content", mx: "auto", textAlign: "left", mt: 1 }}>
          <Hand hand={hand} />
        </Box>
      )}
    </>
  );
}

export function PlayBoard(p: Props) {
  const { board, seat, comparison: c } = p;
  const dir = directionOf(seat);
  const seats = Object.fromEntries(
    SEATS.map((s) => [
      s,
      <SeatLabel
        key={s}
        name={p.names[s]}
        away={p.away[s]}
        dealer={s === board.dealer}
        vul={isVulnerable(board.vul, directionOf(s))}
        hand={c ? board.hands[s] : undefined}
      />,
    ]),
  ) as Record<Seat, ReactNode>;
  // Lasts while you're in the game (this screen stays put from board to board), not between visits.
  const [largeCards, setLargeCards] = useState(false);
  const trump = p.contract?.contract.strain ?? null;
  const sideLabel = dir === "NS" ? "N/S" : "E/W";
  const matchpoints =
    c && c.mpPct !== null ? `${netParts(c.mpPct).pct} matchpoints, net ${netParts(c.mpPct).net}` : "";

  return (
    <Screen>
      <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 2 }}>
        <Typography variant="body1" color="text.secondary" sx={{ flex: 1 }}>
          Code <strong className="num">{formatJoinCode(p.code)}</strong>
        </Typography>
        <ScoreChip label={p.tally.label} tone={p.tally.tone} onClick={p.onTally} ariaLabel={p.tally.ariaLabel} />
      </Stack>

      {/*
        Once the board is over: the result first (two thin lines, each part opening its detail: the
        result to correct it, your side's score to see how it adds up, the matchpoints to see the
        field), then the table below with all four hands.
      */}
      {c && (
        <Box component="section" aria-label="Result" sx={{ mb: 2, textAlign: "center" }}>
          <Stack direction="row" useFlexGap sx={{ justifyContent: "center", alignItems: "center", flexWrap: "wrap" }}>
            <Button onClick={p.onCorrect} aria-label={`${formatTableResult(c.ours.result)}. Correct the result`} sx={{ typography: "h6", minWidth: 0 }}>
              <ResultText result={c.ours.result} />
            </Button>
            <Button onClick={p.onBreakdown} aria-label={`${formatScore(c.ourScore)} ${sideLabel}. Show the score breakdown`} sx={{ typography: "h6", minWidth: 0 }}>
              <ScoreText score={c.ourScore} />
              &nbsp;{sideLabel}
            </Button>
          </Stack>
          <Stack direction="row" spacing={1} useFlexGap sx={{ justifyContent: "center", alignItems: "center", flexWrap: "wrap" }}>
            {c.mpPct === null ? (
              <Typography color="text.secondary">No field results to compare with, so no matchpoints.</Typography>
            ) : (
              <Button onClick={p.onField} aria-label={`${matchpoints}. Show the field`} sx={{ typography: "h6", minWidth: 0 }}>
                <span className="num">{matchpoints}</span>
              </Button>
            )}
            {board.commentary && (
              <Button variant="outlined" onClick={p.onAnalysis}>
                Analysis
              </Button>
            )}
          </Stack>
        </Box>
      )}

      <Compass
        me={seat}
        seats={seats}
        center={
          <Typography variant="h4" component="h1">
            <Button
              onClick={p.onBoardInfo}
              aria-label={`Board ${p.position}. Show board details`}
              sx={{ typography: "h4" }}
            >
              {p.position}
            </Button>
          </Typography>
        }
      />

      {!c && (
        <>
          {/* One thin row, so the cards stay near the top. Tap it to enter the contract, or change it. */}
          <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: "center", justifyContent: "center", mt: 3 }}>
            <Typography variant="h6" component="h2">
              Contract:
            </Typography>
            {p.contract ? (
              <Button
                onClick={p.onEnterContract}
                aria-label={`${formatContract(p.contract.contract)} by ${SEAT_NAMES[p.contract.declarer]}. Change the contract`}
                sx={{ typography: "h6", minWidth: 0 }}
              >
                <ContractText contract={p.contract.contract} />
                &nbsp;by {SEAT_NAMES[p.contract.declarer]}
              </Button>
            ) : (
              <Button onClick={p.onEnterContract} sx={{ typography: "h6", minWidth: 0 }}>
                Tap to enter
              </Button>
            )}
          </Stack>
          <Section
            title={`Your hand (${hcp(board.hands[seat])} HCP)`}
            id="your-hand"
            tight
            action={
              // Named for the size it switches to, so it isn't also shown as pressed.
              <Button variant="outlined" onClick={() => setLargeCards(!largeCards)}>
                {largeCards ? "Small" : "Large"}
              </Button>
            }
          >
            {/* Large: a suit per row in big type, for reading at arm's length while sorting real cards. */}
            {largeCards ? (
              <Panel>
                <Hand hand={board.hands[seat]} large />
              </Panel>
            ) : (
              <HandTiles hand={board.hands[seat]} trump={trump} />
            )}
          </Section>
          {/* The contract row enters the contract, so the main button only appears once there's one. */}
          {p.contract && (
            <Button variant="contained" size="large" fullWidth sx={{ mt: 3 }} onClick={p.onEnterResult}>
              Enter the result
            </Button>
          )}
        </>
      )}

      <Box sx={{ display: "flex", gap: 1, mt: 4 }}>
        <Button variant="outlined" fullWidth disabled={!p.onPrev} onClick={p.onPrev ?? undefined}>
          Previous board
        </Button>
        <Button variant={c ? "contained" : "outlined"} fullWidth disabled={!p.onNext} onClick={p.onNext ?? undefined}>
          Next board
        </Button>
      </Box>
    </Screen>
  );
}

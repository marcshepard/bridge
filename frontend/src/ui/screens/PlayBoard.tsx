// One board as you see it at the table. Before the result: who sits where, the dealer and
// vulnerability, your 13 cards to deal from, and the contract once the bidding is over (so everyone
// can see it during the play). After it: the result (entered by anyone at the
// table), your score, both sides' matchpoints, and all four hands.

import { Box, Button, Chip, Stack, Typography } from "@mui/material";
import type { ReactNode } from "react";
import type { BoardComparison } from "../../core/compare";
import { describeResult } from "../../core/describe";
import { hcp } from "../../core/deal";
import { type Contract, type Seat, SEATS, directionOf, isVulnerable } from "../../core/types";
import type { Board } from "../../providers/types";
import { FullDeal, Hand } from "../components/Hand";
import { ContractText, ResultText, ScoreText } from "../controls/BridgeText";
import { Compass } from "../controls/Compass";
import { EditButton } from "../controls/EditButton";
import { Panel, Screen, Section, StatPanel } from "../controls/Layout";
import { ScoreChip, type Tone } from "../controls/ScoreChip";
import { formatJoinCode, formatMpPair, netParts, seatWithRelation, vulnerabilityPhrase } from "../labels";

interface Props {
  title: string;
  /** The game's join code, so anyone at the table can read it out to someone rejoining. */
  code: string;
  board: Board;
  seat: Seat;
  names: Record<Seat, string>;
  /** Players with no live connection right now: greyed out, "(away)". */
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
  onEnterContract: () => void;
  onEnterResult: () => void;
  onCorrect: () => void;
  onBreakdown: () => void;
  onField: () => void;
  onAnalysis: () => void;
  onPrev: (() => void) | null;
  onNext: (() => void) | null;
}

/** A seat on the compass: the player's name, plus Dealer and Vulnerable when they apply. */
function SeatLabel({ name, dealer, vul, away }: { name: string; dealer: boolean; vul: boolean; away: boolean }) {
  return (
    <>
      <Box component="span" sx={away ? { color: "text.disabled" } : undefined}>
        {name}
        {away && " (away)"}
      </Box>
      {(dealer || vul) && (
        <Stack direction="row" spacing={0.5} useFlexGap sx={{ justifyContent: "center", flexWrap: "wrap", mt: 0.5 }}>
          {dealer && <Chip size="small" label="Dealer" />}
          {vul && <Chip size="small" color="error" label="Vulnerable" />}
        </Stack>
      )}
    </>
  );
}

export function PlayBoard(p: Props) {
  const { board, seat, comparison: c } = p;
  const dir = directionOf(seat);
  const other = dir === "NS" ? "EW" : "NS";
  const seats = Object.fromEntries(
    SEATS.map((s) => [
      s,
      <SeatLabel
        key={s}
        name={p.names[s]}
        away={p.away[s]}
        dealer={s === board.dealer}
        vul={isVulnerable(board.vul, directionOf(s))}
      />,
    ]),
  ) as Record<Seat, ReactNode>;

  return (
    <Screen>
      {/* The title shortens with "…" on a narrow screen; the join code always shows in full. */}
      <Stack direction="row" spacing={0.5} sx={{ color: "text.secondary", minWidth: 0 }}>
        <Typography variant="body2" noWrap sx={{ minWidth: 0 }}>
          {p.title}
        </Typography>
        <Typography variant="body2" sx={{ flexShrink: 0 }}>
          · Code <strong className="num">{formatJoinCode(p.code)}</strong>
        </Typography>
      </Stack>
      <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 2 }}>
        <Typography variant="h5" component="h1" sx={{ flex: 1 }}>
          Board {board.number}
          <Typography component="span" variant="body1" color="text.secondary">
            {" "}
            of {p.total}
          </Typography>
        </Typography>
        <ScoreChip label={p.tally.label} tone={p.tally.tone} onClick={p.onTally} ariaLabel={p.tally.ariaLabel} />
      </Stack>

      <Compass
        me={seat}
        seats={seats}
        center={
          <Typography variant="h4" component="span" color="text.secondary">
            {board.number}
          </Typography>
        }
      />
      <Typography align="center" sx={{ mt: 1.5 }}>
        Dealer: {seatWithRelation(seat, board.dealer)}. {vulnerabilityPhrase(seat, board.vul)}.
      </Typography>

      {!c ? (
        <>
          {p.contract && (
            <Section title="Contract" id="contract">
              <Panel>
                <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: "center" }}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="h6" component="p">
                      <ContractText contract={p.contract.contract} /> by {seatWithRelation(seat, p.contract.declarer)}
                    </Typography>
                    {p.enteredBy && (
                      <Typography variant="body2" color="text.secondary">
                        Entered by {p.enteredBy}
                      </Typography>
                    )}
                  </Box>
                  <EditButton ariaLabel="Change the contract" onClick={p.onEnterContract}>
                    Change
                  </EditButton>
                </Stack>
              </Panel>
            </Section>
          )}
          <Section title="Your hand" id="your-hand">
            <Panel>
              <Hand hand={board.hands[seat]} large />
            </Panel>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
              {hcp(board.hands[seat])} high-card points
            </Typography>
          </Section>
          {p.contract ? (
            <Button variant="contained" size="large" fullWidth sx={{ mt: 3 }} onClick={p.onEnterResult}>
              Enter the result
            </Button>
          ) : (
            <Button variant="contained" size="large" fullWidth sx={{ mt: 3 }} onClick={p.onEnterContract}>
              Enter the contract
            </Button>
          )}
        </>
      ) : (
        <>
          <Section title="Result" id="result">
            <Panel>
              <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: "flex-start" }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="subtitle1">
                    <ResultText result={c.ours.result} />
                  </Typography>
                  <Typography variant="h5" component="p">
                    <ScoreText score={c.ourScore} />{" "}
                    <Typography component="span" variant="body1" color="text.secondary">
                      points for your side
                    </Typography>
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {describeResult(c.ours)}
                    {p.enteredBy && <> · entered by {p.enteredBy}</>}
                  </Typography>
                </Box>
                <EditButton ariaLabel="Correct the result" onClick={p.onCorrect}>
                  Correct
                </EditButton>
              </Stack>
            </Panel>
          </Section>

          <Box sx={{ mt: 2 }}>
            {c.mpPct === null ? (
              <Panel>
                <Typography color="text.secondary">No field results to compare with, so no matchpoints.</Typography>
              </Panel>
            ) : (
              <StatPanel
                figure={formatMpPair(c.mpPct)}
                caption={`Matchpoints: your side (${dir}) / theirs (${other})`}
                tone={c.mpPct >= 50 ? "primary" : "error"}
                aside={
                  <Box>
                    <Typography variant="h5" component="p" className="num">
                      Net {netParts(c.mpPct).net}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      your % minus theirs: <span className="num">{netParts(c.mpPct).working}</span>
                    </Typography>
                  </Box>
                }
              />
            )}
          </Box>
          <Stack direction="row" spacing={1} useFlexGap sx={{ mt: 1.5, flexWrap: "wrap" }}>
            <Button variant="outlined" onClick={p.onBreakdown}>
              Score breakdown
            </Button>
            <Button variant="outlined" onClick={p.onField}>
              The field
            </Button>
            <Button variant="outlined" onClick={p.onAnalysis}>
              Analysis
            </Button>
          </Stack>

          <Section title="All four hands" id="deal">
            <FullDeal hands={board.hands} you={seat} />
          </Section>
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

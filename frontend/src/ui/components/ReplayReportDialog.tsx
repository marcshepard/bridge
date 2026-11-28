// Dev mode only (Home shows it under `npm run dev`): paste the replay line from a bidding feedback
// email and see the reported call against the bots as they are now: the whole auction with the
// reported call shaded, what it means, what the bot would bid there now and why (as for your own
// call in the review: "would bid the same", or what instead), and the four hands. Tap any other
// call in the auction to see the same for it. A second view shows the whole auction as the bots
// would bid it from the start, with where they part from the actual one. Both show their contract
// and its result double dummy.
//
// The settings come from the line and are used for this view only: your own bidding system is
// never read or changed.

import { Alert, Box, Button, Stack, TextField, Typography } from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import { type Call, auctionResult } from "../../core/auction";
import { type Decision, botAuction, botAuctionWithSimulation, reviewAuction } from "../../core/bidding/bidder";
import { sameCall } from "../../core/bidding/position";
import type { TableSystems } from "../../core/bidding/system";
import type { DoubleDummyTable } from "../../core/doubleDummy";
import { scoreResult } from "../../core/scoring";
import { type Seat, type Vulnerability, SEAT_NAMES, SEATS, directionOf } from "../../core/types";
import { type ReplayBoard, parseReplayLine } from "../../providers/replayLine";
import type { Board } from "../../providers/types";
import { doubleDummy } from "../../services";
import { CallText, ContractText, ResultText, ScoreText, SuitString } from "../controls/BridgeText";
import { ChoiceGroup } from "../controls/ChoiceGroup";
import { Compass } from "../controls/Compass";
import { SheetDialog } from "../controls/SheetDialog";
import { AuctionTable, type CallMark, MarkLegend } from "./Auction";
import { BiddingSystemDialog } from "./BiddingSystemDialog";
import { BotVerdict, ShownBefore, useReviewedAuction } from "./BiddingReview";
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

type View = "actual" | "bots";

/** Vulnerability in words, for the line under the title. */
const VUL_WORDS: Record<Vulnerability, string> = { None: "none vulnerable", NS: "North–South vulnerable", EW: "East–West vulnerable", Both: "all vulnerable" };

function Replay({ replay: { board, calls, reported, systems } }: { replay: ReplayBoard }) {
  const { review, simulating } = useReviewedAuction(board, calls, systems, true);
  const bots = useBotAuction(board, systems);
  const dd = useDoubleDummyTable(board);
  const [view, setView] = useState<View>("actual");
  const [systemsOpen, setSystemsOpen] = useState(false);
  // The call looked at in each view: the reported one to start with, and in the bots' view the
  // first call where they part from the actual auction; or any call tapped.
  const [selected, setSelected] = useState(reported);
  const [botTapped, setBotTapped] = useState<number | null>(null);
  const rep = review[reported];
  if (!rep) return null;
  const parts = bots.review.findIndex((r, i) => !calls[i] || !sameCall(r.call, calls[i]!));
  const botIndex = Math.min(botTapped ?? Math.max(parts, 0), bots.review.length - 1);
  const shownIndex = view === "actual" ? selected : botIndex;
  const r = view === "actual" ? review[selected] : bots.review[botIndex];
  const shownCalls = view === "actual" ? calls : bots.review.map((x) => x.call);
  // In the actual auction, every call is judged against the bot's, whoever made it (the review
  // marks only your own): "?" where the bot would have chosen differently on a close call, "≠" where
  // it differs more clearly, "!" where no rule covers the call.
  const markOf = (i: number): CallMark | null => {
    const x = review[i];
    if (!x || view !== "actual") return null;
    if (!x.agrees) return x.bot.hard ? "hard" : "differs";
    return x.read.guessed ? "norule" : null;
  };
  const marks = shownCalls.map((_, i) => markOf(i)).filter((m): m is CallMark => !!m);
  return (
    <Stack spacing={2}>
      <Typography variant="subtitle1" component="p">
        Board {board.number}, dealer {SEAT_NAMES[board.dealer]}, {VUL_WORDS[board.vul]}.
      </Typography>
      <Box>
        <Button variant="outlined" onClick={() => setSystemsOpen(true)}>
          Bidding systems
        </Button>
      </Box>
      <BiddingSystemDialog
        open={systemsOpen}
        onClose={() => setSystemsOpen(false)}
        title="This board's bidding systems"
        intro="Each side's card, from the replay line. Used for this replay only: your own bidding system isn't changed."
        cards={[
          { label: "North–South", system: systems.NS },
          { label: "East–West", system: systems.EW },
        ]}
      />
      <ChoiceGroup<View>
        label="Auction"
        space="tight"
        value={view}
        onChange={setView}
        choices={[
          { value: "actual", label: "As it was bid" },
          { value: "bots", label: "How bots would bid it" },
        ]}
      />
      <Box>
        <AuctionTable
          dealer={board.dealer}
          vul={board.vul}
          names={NO_NAMES}
          calls={shownCalls}
          seat={rep.seat}
          shaded={shownIndex}
          onOpenCall={view === "actual" ? setSelected : setBotTapped}
          marks={markOf}
        />
        <MarkLegend marks={marks} />
        <ContractLine board={board} calls={shownCalls} dd={dd} />
        {view === "bots" && (
          <Typography variant="body2" color="text.secondary">
            {parts < 0 ? "The bots bid it exactly as it was bid." : `The bots part from the actual auction at call ${parts + 1}.`}
            {bots.simulating && " Working out the hard calls…"}
          </Typography>
        )}
      </Box>
      {r && (
        <>
          <Box>
            <Typography variant="subtitle2" component="h3" color="text.secondary">
              {SEAT_NAMES[r.seat]}: <CallText call={r.call} />
              {view === "actual" && selected === reported ? " (the reported bid)" : ""}
            </Typography>
            <Typography>
              <SuitString text={r.read.meaning} />
            </Typography>
          </Box>
          {view === "actual" ? (
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
          ) : (
            <BotVerdict r={r} isBot isMine={false} />
          )}
          <ShownBefore r={r} me={rep.seat} />
        </>
      )}
      <Compass
        me={rep.seat}
        bottom="S"
        seats={Object.fromEntries(SEATS.map((s) => [s, <SeatHand key={s} seat={s} hand={board.hands[s]} trump={null} />])) as Record<Seat, React.ReactNode>}
        label="All four hands"
      />
    </Stack>
  );
}

/**
 * The whole auction as the bots would bid it from the start, all four seats, each call explained.
 * The rules' auction shows at once; with the double-dummy solver, the hard calls are then settled
 * by simulation, as the bots do at the table (seeded, so it's the same each time).
 */
function useBotAuction(board: Board, systems: TableSystems) {
  const deal = useMemo(() => ({ dealer: board.dealer, vul: board.vul }), [board]);
  const plain = useMemo(() => botAuction(board.hands, deal, systems), [board, deal, systems]);
  const [decisions, setDecisions] = useState<Decision[]>(plain);
  const [simulating, setSimulating] = useState(false);
  useEffect(() => {
    setDecisions(plain);
    if (!doubleDummy) return;
    let cancelled = false;
    setSimulating(true);
    botAuctionWithSimulation(board.hands, deal, systems, doubleDummy)
      .then((d) => {
        if (!cancelled) setDecisions(d);
      })
      .catch(() => {
        // The rules' auction stands.
      })
      .finally(() => {
        if (!cancelled) setSimulating(false);
      });
    return () => {
      cancelled = true;
    };
  }, [plain]);
  const review = useMemo(() => {
    const read = reviewAuction(
      board.hands,
      deal,
      decisions.map((d) => d.call),
      systems,
    );
    // Each call with the bot's own reason for it (and its simulation, for a hard call).
    return read.map((r, i) => ({ ...r, bot: decisions[i] ?? r.bot, agrees: true }));
  }, [board, deal, decisions, systems]);
  return { review, simulating };
}

/** Tricks for every declarer in every strain: from the board, else worked out by the solver. */
function useDoubleDummyTable(board: Board): DoubleDummyTable | null {
  const [table, setTable] = useState<DoubleDummyTable | null>(board.doubleDummy?.tricks ?? null);
  useEffect(() => {
    if (board.doubleDummy?.tricks || !doubleDummy) return;
    let cancelled = false;
    doubleDummy
      .table(board.hands)
      .then((t) => {
        if (!cancelled) setTable(t);
      })
      .catch(() => {
        // No result, then: the contract alone.
      });
    return () => {
      cancelled = true;
    };
  }, [board]);
  return table;
}

/** The auction's contract, with its result and score double dummy ("3NT by W, made: +400 to East–West"). */
function ContractLine({ board, calls, dd }: { board: Board; calls: Call[]; dd: DoubleDummyTable | null }) {
  const end = auctionResult(board.dealer, calls);
  if (!end) return null;
  if (!end.contract || !end.declarer) return <Typography sx={{ mt: 1 }}>Passed out.</Typography>;
  const tricks = dd?.[end.declarer][end.contract.strain];
  if (tricks === undefined) {
    return (
      <Typography sx={{ mt: 1 }}>
        Contract: <ContractText contract={end.contract} /> by {end.declarer}.
      </Typography>
    );
  }
  const score = scoreResult({ contract: end.contract, declarer: end.declarer, tricks }, board.vul);
  const side = directionOf(end.declarer) === "NS" ? "North–South" : "East–West";
  return (
    <Typography sx={{ mt: 1 }}>
      Double dummy: <ResultText result={score.result} />, <ScoreText score={score.declarerScore} strong /> to {side}.
    </Typography>
  );
}

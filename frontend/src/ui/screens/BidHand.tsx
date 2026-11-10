// Bidding a board on the players' devices: the board screen while the auction is going. Each device
// shows the auction so far, a bidding box and its own hand; the calls come from the shared auction
// (the backend checks every call), so all four devices show the same auction. When it ends, the
// contract goes in and the play table takes over; passed out, the board is done.
//
// Bots bid by themselves: the game owner's device makes their calls, by the rules in core/bidding,
// after a short pause so everyone can follow. In bidding practice the bots can bid your seat too
// ("Bots bid for me"), and then they go quicker.
// (Players see "bid" for every call, Pass and doubles included; "call" is only the code's word.)

import { Box, Button, FormControlLabel, Switch, Typography } from "@mui/material";
import { useEffect, useState } from "react";
import { type Call, auctionResult, canCall, isAuctionOver, toCall } from "../../core/auction";
import { chooseCall, chooseCallWithSimulation } from "../../core/bidding/bidder";
import { doubleDummy } from "../../services";
import type { TableSystems } from "../../core/bidding/system";
import { hcp } from "../../core/deal";
import { type Seat, type Strain, STRAINS, SEAT_NAMES } from "../../core/types";
import type { Board } from "../../providers/types";
import { AuctionTable } from "../components/Auction";
import { HandTiles } from "../components/Hand";
import { CallText, ContractText, StrainSymbol, callWords } from "../controls/BridgeText";
import { ChoiceGroup } from "../controls/ChoiceGroup";
import { Panel, Section } from "../controls/Layout";
import { TurnStrip } from "../controls/TurnStrip";

const STRAIN_WORDS: Record<Strain, string> = { C: "Clubs", D: "Diamonds", H: "Hearts", S: "Spades", NT: "No trumps" };

/** How long a bot takes over its call, so the table can follow the auction. */
const BOT_DELAY_MS = 1200;
/** Quicker when the bots bid every seat (you're watching): you'll read it all in the review. */
const WATCH_DELAY_MS = 350;

interface Props {
  board: Board;
  seat: Seat;
  names: Record<Seat, string>;
  /** Players with no live connection right now: the auction waits for them. */
  away: Record<Seat, boolean>;
  /** Seats held by bots (practice games, dev test players). */
  bots: Seat[];
  /** The seats this device makes the bots' calls for (the owner's device: the bots, and in practice perhaps your own). */
  autoSeats: Seat[];
  /** The card each side bids by. */
  systems: TableSystems;
  /** Bidding practice: the "Bots bid for me" switch. */
  watch?: { on: boolean; onChange: (on: boolean) => void; label?: string };
  /** The calls so far, in order. */
  calls: Call[];
  /** Sends a call (`seq` is its number in the auction, from 1); rejects with the reason if it's refused. */
  onCall: (seq: number, call: Call) => Promise<void>;
}

export function BidHand(p: Props) {
  const { board, seat, names, away, calls } = p;
  const dealer = board.dealer;
  const over = isAuctionOver(calls);
  const caller = toCall(dealer, calls);
  // A call this device makes by the bot's rules: a bot's (on the owner's device), or yours when the bots bid for you.
  const auto = !over && p.autoSeats.includes(caller);
  const mine = !over && caller === seat && !auto;

  const [level, setLevel] = useState<number | null>(null);
  const [picked, setPicked] = useState<Call | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // A new call (anyone's) starts the box afresh.
  useEffect(() => {
    setLevel(null);
    setPicked(null);
    setHint(null);
  }, [calls.length]);

  // The bots' calls: after a pause (shorter when you're watching them bid your seat too). If the
  // call is refused (another device got there first, say), the next update starts the timer again.
  const watching = !!p.watch?.on;
  // A hard call is decided by simulation (double dummy over deals that fit the auction), worked out
  // during the pause, so the bot takes no longer unless the simulation does.
  useEffect(() => {
    if (!auto) return;
    let cancelled = false;
    const pause = new Promise((resolve) => setTimeout(resolve, watching ? WATCH_DELAY_MS : BOT_DELAY_MS));
    const decision = chooseCallWithSimulation(board.hands[caller], { dealer, vul: board.vul }, calls, p.systems, doubleDummy).catch(
      // If the solver fails, the rules of thumb still give a call.
      () => chooseCall(board.hands[caller], { dealer, vul: board.vul }, calls, p.systems),
    );
    void Promise.all([decision, pause]).then(([d]) => {
      if (!cancelled) void p.onCall(calls.length + 1, d.call).catch(() => {});
    });
    return () => {
      cancelled = true;
    };
  }, [auto, calls.length, caller, watching]);

  const allowed = (call: Call) => mine && canCall(dealer, calls, call);
  const bidAllowed = (lv: number, strain: Strain) => allowed({ kind: "bid", level: lv, strain });

  async function send() {
    if (!picked) return;
    setHint(null);
    setBusy(true);
    try {
      await p.onCall(calls.length + 1, picked);
    } catch (e) {
      setHint((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const end = auctionResult(dealer, calls);
  const awayNote = away[caller] && !p.bots.includes(caller) ? " (away)" : "";
  const turn = over
    ? ""
    : caller === seat
      ? auto
        ? "Bot bidding for you"
        : "Your turn"
      : `${SEAT_NAMES[caller]}'s turn${p.bots.includes(caller) ? " (bot)" : awayNote}`;
  const vulText = { None: "None vul", NS: "N/S vul", EW: "E/W vul", Both: "Both vul" }[board.vul];

  return (
    <Box component="section" aria-label="Bidding">
      <TurnStrip
        left={
          <Typography variant="h6" component="h1" sx={{ lineHeight: 1.2 }} noWrap>
            Bidding
            <Typography variant="caption" component="span" color="text.secondary" sx={{ display: "block" }} noWrap>
              {SEAT_NAMES[dealer]} dealt
            </Typography>
          </Typography>
        }
        turn={turn}
        mine={mine}
        right={
          <Typography variant="caption" color="text.secondary">
            {vulText}
          </Typography>
        }
      />
      {/* Why a bid didn't go, what's happening, or how the auction ended. Always its height. */}
      <Typography variant="subtitle1" noWrap sx={{ mb: 1 }} aria-live="polite" color={hint ? "error" : undefined}>
        {hint ??
          (busy ? (
            "Sending your bid…"
          ) : end ? (
            end.contract && end.declarer ? (
              <>
                The contract is <ContractText contract={end.contract} /> by {SEAT_NAMES[end.declarer]}
              </>
            ) : (
              "Passed out"
            )
          ) : (
            " "
          ))}
      </Typography>

      <AuctionTable dealer={dealer} vul={board.vul} names={names} calls={calls} seat={seat} />
      {p.watch && (
        <FormControlLabel
          sx={{ mt: 1 }}
          control={<Switch checked={p.watch.on} onChange={(e) => p.watch!.onChange(e.target.checked)} />}
          label={p.watch.label ?? "Bots bid for me"}
        />
      )}

      {/*
        The bidding box, under its own heading and in a panel, so it reads as the place you act
        rather than part of the auction above. Greyed out until it's your turn, and for bids you
        can't make.
      */}
      {!over && (
        <Section title="Your bid" id="your-bid">
          <Panel>
            <ChoiceGroup
              value={level}
              disabled={!mine || busy}
              onChange={(lv) => {
                setLevel(lv);
                setPicked(picked?.kind === "bid" && bidAllowed(lv, picked.strain) ? { ...picked, level: lv } : null);
              }}
              choices={[1, 2, 3, 4, 5, 6, 7].map((lv) => ({
                value: lv,
                label: lv,
                ariaLabel: `Level ${lv}`,
                disabled: !STRAINS.some((s) => bidAllowed(lv, s)),
              }))}
            />
            {/* The level and the suit make one bid, so they sit together; Pass, X and XX are a choice of their own. */}
            <ChoiceGroup
              space="tight"
              value={picked?.kind === "bid" ? picked.strain : null}
              disabled={!mine || busy || level === null}
              onChange={(strain) => level !== null && setPicked({ kind: "bid", level, strain })}
              choices={STRAINS.map((s) => ({
                value: s,
                label: <StrainSymbol strain={s} />,
                ariaLabel: STRAIN_WORDS[s],
                disabled: level === null || !bidAllowed(level, s),
              }))}
            />
            <ChoiceGroup<"pass" | "double" | "redouble">
              space="loose"
              value={picked && picked.kind !== "bid" ? picked.kind : null}
              disabled={!mine || busy}
              onChange={(kind) => {
                setLevel(null);
                setPicked({ kind });
              }}
              choices={[
                { value: "pass", label: "Pass", disabled: !allowed({ kind: "pass" }) },
                { value: "double", label: "X", ariaLabel: "Double", disabled: !allowed({ kind: "double" }) },
                { value: "redouble", label: "XX", ariaLabel: "Redouble", disabled: !allowed({ kind: "redouble" }) },
              ]}
            />
            {/*
              One tap makes the bid you've put together. It says which ("Submit 3♥", "Submit Pass"),
              worded unlike the box's own buttons, so it never looks like a second "Pass".
            */}
            <Box sx={{ textAlign: "center", mt: 2 }}>
              <Button
                variant="contained"
                size="large"
                disabled={!mine || busy || !picked}
                aria-label={picked ? `Submit ${callWords(picked)}` : undefined}
                onClick={() => void send()}
                sx={{ minWidth: (t) => t.spacing(20) }}
              >
                Submit
                {picked && (
                  <>
                    &nbsp;
                    {picked.kind === "bid" ? <CallText call={picked} /> : callWords(picked)}
                  </>
                )}
              </Button>
            </Box>
          </Panel>
        </Section>
      )}

      <Section title={`Your hand (${hcp(board.hands[seat])} HCP)`} id="your-hand" tight>
        <HandTiles hand={board.hands[seat]} trump={null} />
      </Section>
    </Box>
  );
}

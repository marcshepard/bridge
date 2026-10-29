// Bidding a board on the players' devices: the board screen while the auction is going. Each device
// shows the auction so far, a bidding box and its own hand; the calls come from the shared auction
// (the backend checks every call), so all four devices show the same auction. When it ends, the
// contract goes in and the play table takes over; passed out, the board is done.
//
// Bots don't bid: the game creator's device bids for them, and shows the bot's hand while it does.
// (Players see "bid" for every call, Pass and doubles included; "call" is only the code's word.)

import { Box, Button, Typography } from "@mui/material";
import { useEffect, useState } from "react";
import { type Call, auctionResult, canCall, isAuctionOver, toCall } from "../../core/auction";
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

interface Props {
  board: Board;
  seat: Seat;
  names: Record<Seat, string>;
  /** Players with no live connection right now: the auction waits for them. */
  away: Record<Seat, boolean>;
  /** Seats held by bots (demo games, dev test players). */
  bots: Seat[];
  /** This device bids for the bots (it's the game creator's). */
  callsForBots: boolean;
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
  // Your own call, or a bot's that this device makes for it.
  const forBot = !over && caller !== seat && p.callsForBots && p.bots.includes(caller);
  const mine = !over && (caller === seat || forBot);

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
  const turn = over ? "" : caller === seat ? "Your turn" : forBot ? `Bid for ${SEAT_NAMES[caller]}` : `${SEAT_NAMES[caller]}'s turn${awayNote}`;
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

      {/*
        The bidding box, under its own heading and in a panel, so it reads as the place you act
        rather than part of the auction above. Greyed out until it's your turn, and for bids you
        can't make.
      */}
      {!over && (
        <Section title={forBot ? `Bid for ${SEAT_NAMES[caller]}` : "Your bid"} id="your-bid">
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
            <ChoiceGroup
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

      {/* Bidding for a bot: its hand, so you can pick a sensible bid for it. */}
      {forBot && (
        <Section title={`${SEAT_NAMES[caller]}'s hand (bot, ${hcp(board.hands[caller])} HCP)`} id="bot-hand" tight>
          <HandTiles hand={board.hands[caller]} trump={null} label={`${SEAT_NAMES[caller]}'s cards`} />
        </Section>
      )}
      <Section title={`Your hand (${hcp(board.hands[seat])} HCP)`} id="your-hand" tight>
        <HandTiles hand={board.hands[seat]} trump={null} />
      </Section>
    </Box>
  );
}

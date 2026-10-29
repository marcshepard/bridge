import { describe, expect, it } from "vitest";
import { type Call, auctionResult, callCode, canCall, isAuctionOver, parseCall, seatOfCall, toCall } from "./auction";
import { contractCode } from "./contract";
import type { Seat } from "./types";

/** An auction written the way it's stored: "1H PASS 2H PASS PASS PASS". */
const calls = (text: string): Call[] =>
  text
    .split(" ")
    .filter(Boolean)
    .map((t) => parseCall(t)!);

describe("calls", () => {
  it("round-trips the compact form", () => {
    for (const code of ["1C", "3NT", "7S", "PASS", "X", "XX"]) expect(callCode(parseCall(code)!)).toBe(code);
  });

  it("rejects anything that isn't a call", () => {
    for (const code of ["", "0H", "8C", "1N", "3NTX", "P", "DBL"]) expect(parseCall(code)).toBeNull();
  });

  it("goes round the table from the dealer", () => {
    expect([0, 1, 2, 3, 4].map((i) => seatOfCall("W", i))).toEqual(["W", "N", "E", "S", "W"]);
    expect(toCall("E", calls("PASS 1H"))).toBe("W");
  });
});

describe("isAuctionOver", () => {
  it.each([
    ["", false],
    ["PASS PASS PASS", false],
    ["PASS PASS PASS PASS", true],
    ["1H PASS PASS", false],
    ["1H PASS PASS PASS", true],
    ["PASS PASS PASS 1H PASS PASS PASS", true],
    ["1H X PASS PASS", false],
    ["1H X PASS PASS PASS", true],
  ])("%s → %s", (auction, over) => {
    expect(isAuctionOver(calls(auction))).toBe(over);
  });
});

describe("canCall", () => {
  // North deals in every case, so the next caller is found by counting from North.
  it.each([
    // [auction so far, call, allowed]
    ["", "1C", true],
    ["", "X", false], // nothing to double
    ["", "XX", false],
    ["1H", "1S", true],
    ["1H", "1H", false], // not higher
    ["1H", "1D", false],
    ["1H", "2C", true],
    ["1NT", "2C", true],
    ["7NT", "7NT", false],
    ["1H", "X", true], // East doubles North's bid
    ["1H PASS", "X", false], // South can't double partner
    ["1H PASS PASS", "X", true], // West doubles in the pass-out seat
    ["1H X", "XX", true], // South redoubles East's double
    ["1H X", "X", false], // already doubled
    ["1H X PASS", "XX", false], // West can't redouble partner's double
    ["1H X PASS PASS", "XX", true], // North redoubles
    ["1H X XX", "X", false],
    ["1H PASS PASS PASS", "PASS", false], // over
  ])("after %j: %s is %s", (auction, call, allowed) => {
    expect(canCall("N", calls(auction), parseCall(call)!)).toBe(allowed);
  });
});

describe("auctionResult", () => {
  const result = (dealer: Seat, auction: string) => {
    const r = auctionResult(dealer, calls(auction));
    return r && `${contractCode(r.contract)} ${r.declarer ?? "-"}`;
  };

  it.each([
    // [dealer, auction, contract and declarer]
    ["N", "1H PASS", null], // still going
    ["N", "PASS PASS PASS PASS", "PASS -"],
    ["N", "1H PASS 4H PASS PASS PASS", "4H N"],
    // South named spades first for NS, though North bid them last.
    ["N", "1H PASS 1S PASS 4S PASS PASS PASS", "4S S"],
    ["E", "1C PASS 1NT PASS 3NT PASS PASS PASS", "3NT W"],
    ["N", "1H 2C PASS PASS PASS", "2C E"],
    // East's diamonds don't count: the declaring side is NS.
    ["N", "1C 1D 2D PASS 3NT PASS PASS PASS", "3NT N"],
    ["N", "1C 1D PASS 2D PASS PASS PASS", "2D E"],
    ["N", "1H X PASS PASS PASS", "1HX N"],
    ["N", "1H X XX PASS PASS PASS", "1HXX N"],
    // A new bid wipes out the double.
    ["N", "1H X 2H PASS PASS PASS", "2H N"],
    ["W", "PASS PASS PASS 1S PASS PASS PASS", "1S S"],
  ])("dealer %s, %s → %s", (dealer, auction, expected) => {
    expect(result(dealer as Seat, auction)).toBe(expected);
  });
});

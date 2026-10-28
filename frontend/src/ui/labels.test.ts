import { describe, expect, it } from "vitest";
import { formatMargin, formatMpPair, formatPct, handSuitOrder, isAway, netParts, sameName, seatRequestNews } from "./labels";

describe("numbers on screen are whole", () => {
  it("percentages round to whole numbers", () => {
    expect(formatPct(66.67)).toBe("67%");
    expect(formatPct(50)).toBe("50%");
    expect(formatPct(null)).toBe("—");
  });

  it("both sides' matchpoints always add to 100", () => {
    expect(formatMpPair(83.3)).toBe("83 / 17");
    expect(formatMpPair(50.5)).toBe("51 / 49");
    expect(formatMpPair(0)).toBe("0 / 100");
  });

  it("margins are signed whole numbers", () => {
    expect(formatMargin(66.7)).toBe("+67");
    expect(formatMargin(-12.4)).toBe("−12");
    expect(formatMargin(0.3)).toBe("0");
  });
});

describe("a board's net", () => {
  it("shows whole percentages when they add up", () => {
    expect(netParts(95)).toEqual({ net: "+90", working: "95 − 5", pct: "95%" });
    expect(netParts(50)).toEqual({ net: "0", working: "50 − 50", pct: "50%" });
  });

  it("shows one decimal when rounding would hide where the net comes from", () => {
    expect(netParts(95.4)).toEqual({ net: "+91", working: "95.4 − 4.6", pct: "95.4%" });
    expect(netParts(20.3)).toEqual({ net: "−59", working: "20.3 − 79.7", pct: "20.3%" });
  });
});

describe("who is away", () => {
  it("is anyone else without a live connection, never yourself", () => {
    expect(isAway({ slot: 2, connected: false }, 1)).toBe(true);
    expect(isAway({ slot: 2, connected: true }, 1)).toBe(false);
    expect(isAway({ slot: 1, connected: false }, 1)).toBe(false);
  });
});

describe("seat request news", () => {
  it("says who replaced whom, or that someone moved device", () => {
    expect(seatRequestNews("allowed", "Dana", "Joe", "Ann")).toBe("Dana has replaced Joe.");
    expect(seatRequestNews("allowed", "marc", "Marc", "Ann")).toBe("marc has moved to another device.");
    expect(seatRequestNews("denied", "Dana", "Joe", "Ann")).toBe("Ann didn't let Dana replace Joe.");
    expect(seatRequestNews("cancelled", "Dana", "Joe", null)).toBeNull();
  });

  it("matches names ignoring case and spacing", () => {
    expect(sameName("  Marc  Shep", "marc shep")).toBe(true);
    expect(sameName("Marc", "Mark")).toBe(false);
  });
});

describe("a hand's suits side by side", () => {
  it("alternate black and red with no trumps", () => {
    expect(handSuitOrder(null)).toEqual(["S", "H", "C", "D"]);
    expect(handSuitOrder("NT")).toEqual(["S", "H", "C", "D"]);
    expect(handSuitOrder("S")).toEqual(["S", "H", "C", "D"]);
  });

  it("put trumps first and still alternate colours", () => {
    expect(handSuitOrder("H")).toEqual(["H", "S", "D", "C"]);
    expect(handSuitOrder("D")).toEqual(["D", "S", "H", "C"]);
    expect(handSuitOrder("C")).toEqual(["C", "H", "S", "D"]);
  });
});

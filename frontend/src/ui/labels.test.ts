import { describe, expect, it } from "vitest";
import { formatMargin, formatMp, formatMpPair, formatPct, formatShare, handSuitOrder, isAway, netParts, sameName, seatRequestNews } from "./labels";

describe("numbers on screen are whole", () => {
  it("percentages round to whole numbers", () => {
    expect(formatPct(66.67)).toBe("67%");
    expect(formatPct(50)).toBe("50%");
    expect(formatPct(null)).toBe("—");
  });

  it("a share of the field's tables is 0% or 100% only when it's none or all of them", () => {
    expect(formatShare(0)).toBe("0%");
    expect(formatShare(0.3)).toBe("<1%");
    expect(formatShare(5.1)).toBe("5%");
    expect(formatShare(99.7)).toBe(">99%");
    expect(formatShare(100)).toBe("100%");
  });

  it("your matchpoints are to one decimal unless it's zero", () => {
    expect(formatMp(96.27)).toBe("96.3%");
    expect(formatMp(62.04)).toBe("62%");
    expect(formatMp(null)).toBe("—");
  });

  it("both sides' matchpoints always add to 100", () => {
    expect(formatMpPair(83.3)).toBe("83 / 17");
    expect(formatMpPair(50.5)).toBe("51 / 49");
    expect(formatMpPair(0)).toBe("0 / 100");
  });

  it("margins are signed, to one decimal unless it's zero", () => {
    expect(formatMargin(66.7)).toBe("+66.7");
    expect(formatMargin(-12.4)).toBe("−12.4");
    expect(formatMargin(67)).toBe("+67");
    expect(formatMargin(0.03)).toBe("0");
  });
});

describe("a board's net", () => {
  it("drops the decimal when it's zero", () => {
    expect(netParts(95)).toEqual({ net: "+90", working: "95 − 5", pct: "95%" });
    expect(netParts(50)).toEqual({ net: "0", working: "50 − 50", pct: "50%" });
    expect(netParts(62.04)).toEqual({ net: "+24", working: "62 − 38", pct: "62%" });
  });

  it("otherwise shows one decimal", () => {
    expect(netParts(95.4)).toEqual({ net: "+90.8", working: "95.4 − 4.6", pct: "95.4%" });
    expect(netParts(20.3)).toEqual({ net: "−59.4", working: "20.3 − 79.7", pct: "20.3%" });
    expect(netParts(83.2)).toEqual({ net: "+66.4", working: "83.2 − 16.8", pct: "83.2%" });
    expect(netParts(62.75)).toEqual({ net: "+25.6", working: "62.8 − 37.2", pct: "62.8%" });
    expect(netParts(903 / 938 * 100)).toEqual({ net: "+92.6", working: "96.3 − 3.7", pct: "96.3%" });
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

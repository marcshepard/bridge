import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { compareBoard, scoreField } from "../core/compare";
import { tableResult } from "../core/contract";
import { parseGameFile } from "./gameFile";
import { fileToGameFile } from "./importFile";
import { looksLikeTcgPage, tcgPageToGameFile } from "./tcgPage";

// A cut-down page with the same markup as a saved Common Game results page. The deals, scores and
// commentary are made up: real TCG data never goes in the repo.
const hand = (board: number, seat: string, s: string, h: string, d: string, c: string) =>
  `<td id="board_${board}_setup_${seat}" class="hands"><div><span class="spade"></span> ${s}</div>` +
  `<div><span class="heart"></span> ${h}</div><div><span class="diamond"></span> ${d}</div>` +
  `<div><span class="club"></span> ${c}</div></td>`;

const board = (n: number, dealer: string, vul: string, rows: Array<[string, string]>, extra = "") => `
<div id="board_${n}" class="span12 well">
  <div class="span6">
    <h2> Board ${n} (10/22/26)</h2>
    <div id="board_setup_dealer">${dealer} Deals</div>
    <div id="board_setup_vul">${vul} Vul</div>
    ${hand(n, "north", "AQ84", "QT98", "J", "KQ43")}
    ${hand(n, "west", "J9532", "A7", "KQ84", "96")}
    ${hand(n, "east", "K", "KJ632", "AT962", "75")}
    ${hand(n, "south", "T76", "54", "753", "AJT82")}
    <div id="board_${n}_setup_dda">NS&nbsp;2N; <br>Optimal Contract&nbsp;&#8722;50: EW&nbsp;3<span class="bcdiams">♦</span>=<p></p></div>
    <div id="stats_${n}"><table><thead><tr><th>N/S Result</th><th># of Pairs</th><th>PCT</th><th>MP %</th></tr></thead>
      <tbody>${rows.map(([s, c]) => `<tr><td class="dt-type-numeric">${s}</td><td class="dt-type-numeric">${c}</td><td>1</td><td>50</td></tr>`).join("")}</tbody>
    </table></div>
  </div>
  <div class="span6">${extra}</div>
</div>`;

const PAGE = `<html><head><title>The Common Game Top 50 Page</title></head><body>
<h2> 299ers Top 50 Ranking</h2>
<table><tr><td>Player names and emails live here and must be ignored</td><td>7</td></tr></table>
${board(1, "N", "None", [["110", "45"], ["-50", "27"], ["−100", "3"]],
  `<div id="mm_1_&quot;" class="well board_analysis"><strong data-content="someone@example.com">Expert</strong>
   <p class="bccmtfinal"> </p><p class="bccmtfinal">West should &amp; would lead a <span class="bchearts">♥</span>.</p></div>`)}
${board(2, "E", "N-S", [["420", "10"], ["AVE", "1"]])}
</body></html>`;

describe("Common Game results page", () => {
  const file = tcgPageToGameFile(PAGE, "tcg-results.html");
  const game = parseGameFile(file);

  it("is recognised", () => {
    expect(looksLikeTcgPage(PAGE)).toBe(true);
    expect(looksLikeTcgPage("[Board \"1\"]")).toBe(false);
  });

  it("reads the date, the field name and every board's deal", () => {
    expect(file.id).toBe("tcg-2026-10-22-299er");
    expect(game.summary.title).toBe("The Common Game, Thu 22 Oct 2026 (299er)");
    expect(game.summary.date).toBe("2026-10-22");
    expect(game.boards.map((b) => [b.number, b.dealer, b.vul])).toEqual([
      [1, "N", "None"],
      [2, "E", "NS"],
    ]);
    expect(game.boards[0]!.hands.N).toEqual({ S: "AQ84", H: "QT98", D: "J", C: "KQ43" });
  });

  it("turns the results distribution into score-only field results", () => {
    expect(game.boards[0]!.field).toEqual([
      { result: null, nsScore: 110, count: 45 },
      { result: null, nsScore: -50, count: 27 },
      { result: null, nsScore: -100, count: 3 },
    ]);
  });

  it("skips a results row that isn't a score, with a warning", () => {
    expect(game.boards[1]!.field).toEqual([{ result: null, nsScore: 420, count: 10 }]);
    expect(game.warnings).toHaveLength(1);
    expect(game.warnings[0]).toMatch(/Board 2/);
  });

  it("reads the par score and the commentary, and nothing from the rankings", () => {
    expect(game.boards[0]!.doubleDummy).toEqual({ par: { nsScore: -50, contracts: [] } });
    expect(game.boards[0]!.commentary).toBe("West should & would lead a ♥.");
    expect(game.boards[1]!.commentary).toBeUndefined();
    expect(JSON.stringify(file)).not.toContain("example.com");
  });

  it("can be compared with the field", () => {
    const b = game.boards[0]!;
    const c = compareBoard(tableResult("2S", "N", 8), "NS", b.vul, scoreField(b.field, b.vul)); // NS +110
    expect(c.fieldSize).toBe(75);
    expect([c.beat, c.tied]).toEqual([30, 45]);
  });

  it("adds no field label for the regular archive", () => {
    const open = tcgPageToGameFile(PAGE.replace("<h2> 299ers Top 50 Ranking</h2>", "<h2>  Top 50 Ranking</h2>"), "p.html");
    expect(open.id).toBe("tcg-2026-10-22");
    expect(open.title).toBe("The Common Game, Thu 22 Oct 2026");
  });

  it("is chosen by file name or by content when uploaded", () => {
    expect(fileToGameFile("page.htm", PAGE).id).toBe(file.id);
    expect(fileToGameFile("page.txt", PAGE).id).toBe(file.id);
    expect(() => fileToGameFile("other.html", "<html><body>Hello</body></html>")).toThrow(/Common Game/);
  });
});

// A real saved page (the regular archive, 16 Oct 2026), if it's in private/ (gitignored; see
// docs/DESIGN.md). Skipped otherwise.
const REAL = resolve(__dirname, "../../../private/The Common Game Top 50 Page.html");

describe.skipIf(!existsSync(REAL))("saved Common Game page in private/", () => {
  it("imports all 36 boards and the whole field, with no warnings", () => {
    const game = parseGameFile(fileToGameFile("The Common Game Top 50 Page.html", readFileSync(REAL, "utf-8")));
    expect(game.summary.title).toBe("The Common Game, Fri 16 Oct 2026");
    expect(game.boards).toHaveLength(36);
    expect(game.boards[0]!.field.reduce((n, f) => n + f.count, 0)).toBe(938);
    expect(game.boards.every((b) => b.field.length > 0)).toBe(true);
    expect(game.warnings).toEqual([]);
  });
});

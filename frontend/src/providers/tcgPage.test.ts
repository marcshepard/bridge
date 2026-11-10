import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { compareBoard, scoreField } from "../core/compare";
import { tableResult } from "../core/contract";
import { parseGameFile } from "./gameFile";
import { fileToGameFile } from "./importFile";
import { looksLikeMhtml, mhtmlToHtml } from "./mhtml";
import { looksLikeTcgPage, tcgPageToGameFile } from "./tcgPage";
import { looksLikeWebArchive, webArchiveToHtml } from "./webarchive";

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
    expect(game.summary.title).toBe("The Common Game 10/22/26 (299er)");
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
    expect(open.title).toBe("The Common Game 10/22/26");
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
    expect(game.summary.title).toBe("The Common Game 10/16/26");
    expect(game.boards).toHaveLength(36);
    expect(game.boards[0]!.field.reduce((n, f) => n + f.count, 0)).toBe(938);
    expect(game.boards.every((b) => b.field.length > 0)).toBe(true);
    expect(game.warnings).toEqual([]);
  });
});

// The same made-up page as Chrome on Android saves it (⋮ → Download): a MIME message with the page
// as one part and its images and stylesheets as others.
const mhtml = (page: string, encoding = "binary") => {
  const b = "----MultipartBoundary--abc123----";
  return [
    "From: <Saved by Blink>",
    "Snapshot-Content-Location: https://example.com/results.php?date=20261022",
    "Subject: The Common Game Top 50 Page",
    "MIME-Version: 1.0",
    "Content-Type: multipart/related;",
    '\ttype="text/html";',
    `\tboundary="${b}"`,
    "",
    "",
    `--${b}`,
    "Content-Type: text/html",
    "Content-ID: <frame-1@mhtml.blink>",
    `Content-Transfer-Encoding: ${encoding}`,
    "Content-Location: https://example.com/results.php?date=20261022",
    "",
    page,
    "",
    `--${b}`,
    "Content-Type: image/png",
    "Content-Transfer-Encoding: binary",
    "Content-Location: https://example.com/logo.png",
    "",
    "\u0089PNG not really",
    `--${b}--`,
    "",
  ].join("\r\n");
};

/** Quoted-printable, as an older Chrome writes it: "=" escaped, non-ASCII as UTF-8 bytes, lines wrapped. */
const quotedPrintable = (text: string) =>
  [...new TextEncoder().encode(text)]
    .map((byte) => (byte === 0x3d || byte > 0x7e ? `=${byte.toString(16).toUpperCase().padStart(2, "0")}` : String.fromCharCode(byte)))
    .join("")
    .replace(/(.{70})/g, "$1=\r\n");

describe("Common Game page saved by a phone (.mht / .mhtml)", () => {
  const expected = tcgPageToGameFile(PAGE, "The Common Game Top 50 Page.mht");

  it("is recognised by its headers, and the page is taken out of it", () => {
    expect(looksLikeMhtml(mhtml(PAGE))).toBe(true);
    expect(looksLikeMhtml(PAGE)).toBe(false);
    expect(mhtmlToHtml(mhtml(PAGE))).toBe(PAGE);
  });

  it("imports the same game as the page itself", () => {
    expect(fileToGameFile("The Common Game Top 50 Page.mht", mhtml(PAGE))).toEqual(expected);
    // .mhtml too, and by content whatever the file is called (the name only goes in the attribution).
    for (const name of ["The Common Game Top 50 Page.mhtml", "download"]) {
      const file = fileToGameFile(name, mhtml(PAGE));
      expect([file.id, file.title, file.boards]).toEqual([expected.id, expected.title, expected.boards]);
    }
  });

  it("decodes a page stored quoted-printable or base64", () => {
    expect(mhtmlToHtml(mhtml(quotedPrintable(PAGE), "quoted-printable"))).toBe(PAGE);
    const base64 = btoa(String.fromCharCode(...new TextEncoder().encode(PAGE))).replace(/(.{76})/g, "$1\r\n");
    expect(mhtmlToHtml(mhtml(base64, "base64"))).toBe(PAGE);
  });

  it("says so when the saved page isn't a Common Game results page", () => {
    expect(() => fileToGameFile("other.mht", mhtml("<html><body>Hello</body></html>"))).toThrow(/Common Game/);
  });
});

// A real page saved by Chrome on Android (the results for 9 Nov 2026), if it's in private/.
// Skipped otherwise.
const REAL_MHT = resolve(__dirname, "../../../private/The Common Game Top 50 Page.mht");

describe.skipIf(!existsSync(REAL_MHT))("Common Game page saved by a phone in private/", () => {
  it("imports every board and the field, with no warnings", () => {
    const game = parseGameFile(fileToGameFile("The Common Game Top 50 Page.mht", readFileSync(REAL_MHT, "utf-8")));
    expect(game.summary.title).toBe("The Common Game 11/9/26");
    expect(game.boards).toHaveLength(36);
    expect(game.boards[0]!.field.reduce((n, f) => n + f.count, 0)).toBe(1407);
    expect(game.boards.every((b) => b.field.length > 0)).toBe(true);
    expect(game.warnings).toEqual([]);
  });
});

// The same made-up page as Safari on an iPhone or iPad saves it (Share → Options → Web Archive):
// a binary property list. A small encoder, enough for the objects a Web Archive uses.
type Plist = string | Uint8Array | Plist[] | { [key: string]: Plist };

function binaryPlist(top: Plist): Uint8Array {
  const objects: number[][] = [];
  const add = (value: Plist): number => {
    const ref = objects.length;
    objects.push([]);
    const head = (type: number, length: number) =>
      length < 15 ? [(type << 4) | length] : [(type << 4) | 0xf, 0x12, length >>> 24, (length >>> 16) & 255, (length >>> 8) & 255, length & 255];
    if (typeof value === "string") {
      const ascii = /^[\x00-\x7f]*$/.test(value);
      objects[ref] = ascii
        ? [...head(0x5, value.length), ...[...value].map((c) => c.charCodeAt(0))]
        : [...head(0x6, value.length), ...[...value].flatMap((_, i) => [value.charCodeAt(i) >> 8, value.charCodeAt(i) & 255])];
    } else if (value instanceof Uint8Array) {
      objects[ref] = [...head(0x4, value.length), ...value];
    } else if (Array.isArray(value)) {
      const refs = value.map(add);
      objects[ref] = [...head(0xa, refs.length), ...refs];
    } else {
      const keys = Object.keys(value).map(add);
      const values = Object.values(value).map(add);
      objects[ref] = [...head(0xd, keys.length), ...keys, ...values];
    }
    return ref;
  };
  add(top);
  if (objects.length > 255) throw new Error("too many objects for one-byte references");
  const out = [..."bplist00"].map((c) => c.charCodeAt(0));
  const offsets = objects.map((o) => {
    const at = out.length;
    out.push(...o);
    return at;
  });
  const table = out.length;
  for (const at of offsets) out.push(at >>> 24, (at >>> 16) & 255, (at >>> 8) & 255, at & 255);
  const u64 = (n: number) => [0, 0, 0, 0, n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
  out.push(0, 0, 0, 0, 0, 0, 4, 1, ...u64(objects.length), ...u64(0), ...u64(table));
  return Uint8Array.from(out);
}

const webArchive = (page: string, type = "text/html") =>
  binaryPlist({
    WebSubresources: [
      { WebResourceURL: "https://example.com/logo.png", WebResourceMIMEType: "image/png", WebResourceData: Uint8Array.from([0x89, 0x50, 0x4e, 0x47]) },
    ],
    WebMainResource: {
      WebResourceTextEncodingName: "UTF-8",
      WebResourceData: new TextEncoder().encode(page),
      WebResourceMIMEType: type,
      WebResourceFrameName: "",
      WebResourceURL: "https://example.com/results.php?date=20261022",
    },
    WebSubframeArchives: [],
  });

describe("Common Game page saved by an iPhone or iPad (.webarchive)", () => {
  const expected = tcgPageToGameFile(PAGE, "The Common Game Top 50 Page.webarchive");

  it("is recognised, and the page is taken out of it", () => {
    expect(looksLikeWebArchive(webArchive(PAGE))).toBe(true);
    expect(looksLikeWebArchive(new TextEncoder().encode(PAGE))).toBe(false);
    expect(webArchiveToHtml(webArchive(PAGE))).toBe(PAGE);
  });

  it("imports the same game as the page itself, by file name or by content", () => {
    expect(fileToGameFile("The Common Game Top 50 Page.webarchive", webArchive(PAGE))).toEqual(expected);
    const file = fileToGameFile("download", webArchive(PAGE));
    expect([file.id, file.title, file.boards]).toEqual([expected.id, expected.title, expected.boards]);
  });

  it("still reads text files passed as bytes", () => {
    expect(fileToGameFile("page.html", new TextEncoder().encode(PAGE))).toEqual(tcgPageToGameFile(PAGE, "page.html"));
  });

  it("says so when the archive isn't a Common Game results page, or is damaged", () => {
    expect(() => fileToGameFile("other.webarchive", webArchive("<html><body>Hello</body></html>"))).toThrow(/Common Game/);
    expect(() => fileToGameFile("pic.webarchive", webArchive(PAGE, "image/png"))).toThrow(/no web page/);
    expect(() => fileToGameFile("cut.webarchive", webArchive(PAGE).subarray(0, 200))).toThrow();
  });
});

// A real page saved by Safari on an iPad (the results for 9 Nov 2026), if it's in private/.
// Skipped otherwise.
const REAL_WEBARCHIVE = resolve(__dirname, "../../../private/The Common Game Top 50 Page.webarchive");

describe.skipIf(!existsSync(REAL_WEBARCHIVE))("Common Game page saved by an iPad in private/", () => {
  it("imports every board and the field, with no warnings", () => {
    const game = parseGameFile(fileToGameFile("The Common Game Top 50 Page.webarchive", new Uint8Array(readFileSync(REAL_WEBARCHIVE))));
    expect(game.summary.title).toBe("The Common Game 11/9/26");
    expect(game.boards).toHaveLength(36);
    expect(game.boards[0]!.field.reduce((n, f) => n + f.count, 0)).toBe(1407);
    expect(game.boards.every((b) => b.field.length > 0)).toBe(true);
    expect(game.warnings).toEqual([]);
  });
});

// Importer: a saved Common Game results page (HTML) → our game file format.
//
// The Common Game's site sits behind bot protection, so players save the results page from their
// browser and upload it. See "Common Game results page" in docs/DESIGN.md for what the page holds.
// What we read, per board (the page has one `<div id="board_N">` block per board):
//
//   <h2> Board 1 (10/22/26)</h2>                                     board number and date
//   #board_setup_dealer "N Deals", #board_setup_vul "N-S Vul"        dealer and vulnerability
//   #board_N_setup_north|east|south|west: one <div> per suit         the hands ("-" for a void)
//   #stats_N table rows: N/S result | # of pairs | PCT | MP%        the field, as scores only
//   #board_N_setup_dda "... Optimal Contract +110: NS 3♦="         par (N/S's point of view)
//   #mm_N_ paragraphs (class bccmtfinal)                            expert commentary, when present
//
// The page gives each N/S score and how many tables got it, but not the contracts, so the field is
// made of score-only results. The "Top 50" tables (player names, clubs, emails) are ignored.
//
// Parsed with regular expressions rather than the DOM so it runs (and is tested) anywhere.

import { SEATS, type Seat } from "../core/types";
import { parseVulnerability, type BoardFileV1, type FieldResultFileV1, type GameFileV1 } from "./gameFile";

/** True if the text looks like a saved Common Game results page. */
export function looksLikeTcgPage(text: string): boolean {
  return text.includes('id="board_setup_dealer"') && /id="board_\d+_setup_north"/.test(text);
}

const SEAT_IDS: Record<Seat, string> = { N: "north", E: "east", S: "south", W: "west" };
const SUIT_ORDER = ["spade", "heart", "diamond", "club"] as const;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Plain text from an HTML fragment: tags removed, common entities decoded, spaces collapsed. */
function textOf(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/** "−50" (the page uses a real minus sign in places) → -50. */
function numberOf(text: string): number {
  return Number(textOf(text).replace(/−/g, "-"));
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "2026-10-22" → "Thu 22 Oct 2026". */
function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const day = DAYS[new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay()];
  return `${day} ${d} ${MONTHS[m! - 1]} ${y}`;
}

function readHand(block: string, board: number, seat: Seat): string {
  const cell = new RegExp(`id="board_${board}_setup_${SEAT_IDS[seat]}"[^>]*>([\\s\\S]*?)</td>`).exec(block);
  if (!cell) throw new Error(`Board ${board}: no hand for ${seat}`);
  const suits: Record<string, string> = {};
  for (const m of cell[1]!.matchAll(/<span class="(spade|heart|diamond|club)"><\/span>([^<]*)/g)) {
    const ranks = m[2]!.trim().toUpperCase();
    suits[m[1]!] = ranks === "-" || ranks === "—" ? "" : ranks.replace(/10/g, "T").replace(/\s+/g, "");
  }
  return SUIT_ORDER.map((s) => suits[s] ?? "").join(".");
}

/**
 * The results distribution: one score-only field line per N/S score. A row that doesn't read as
 * numbers is passed on as-is; parseGameFile then skips it with a warning, as for any source.
 */
function readField(block: string, board: number): FieldResultFileV1[] {
  const start = block.indexOf(`id="stats_${board}"`);
  if (start === -1) return [];
  const end = block.indexOf('class="span6"', start);
  const stats = block.slice(start, end === -1 ? undefined : end);
  // Data rows only: the header rows use <th>, so they don't match.
  return [...stats.matchAll(/<tr>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => ({
    nsScore: numberOf(m[1]!),
    count: numberOf(m[2]!),
  }));
}

function readPar(block: string, board: number): number | null {
  const m = new RegExp(`id="board_${board}_setup_dda"[^>]*>([\\s\\S]*?)</div>`).exec(block);
  if (!m) return null;
  const par = /Optimal Contract\s*([+\-−]?\d+)/.exec(textOf(m[1]!));
  return par ? numberOf(par[1]!) : null;
}

function readCommentary(block: string, board: number): string | undefined {
  const start = block.indexOf(`id="mm_${board}_`);
  if (start === -1) return undefined;
  const end = block.indexOf("</div>", start);
  const html = block.slice(start, end === -1 ? undefined : end);
  const paragraphs = [...html.matchAll(/<p class="bccmtfinal"[^>]*>([\s\S]*?)<\/p>/g)]
    .map((m) => textOf(m[1]!))
    .filter(Boolean);
  return paragraphs.length ? paragraphs.join("\n\n") : undefined;
}

/** Convert a saved Common Game results page into our game file format. */
export function tcgPageToGameFile(html: string, fileName: string): GameFileV1 {
  const starts = [...html.matchAll(/<div id="board_(\d+)"[^>]*>/g)];
  if (starts.length === 0) throw new Error("No boards found on this page. Is it a Common Game results page?");

  const boards: BoardFileV1[] = [];
  let date: string | undefined;

  starts.forEach((m, i) => {
    const number = Number(m[1]);
    const block = html.slice(m.index, starts[i + 1]?.index ?? html.length);

    const heading = /<h2>\s*Board\s+\d+\s*\((\d{1,2})\/(\d{1,2})\/(\d{2,4})\)/.exec(block);
    if (heading && !date) {
      const [, mm, dd, yy] = heading;
      const year = yy!.length === 2 ? `20${yy}` : yy!;
      date = `${year}-${mm!.padStart(2, "0")}-${dd!.padStart(2, "0")}`;
    }

    const dealer = /id="board_setup_dealer">\s*([NESW])\s+Deals/.exec(block)?.[1];
    const vulText = /id="board_setup_vul">\s*([^<]*?)\s*Vul\s*</.exec(block)?.[1];
    if (!dealer || vulText === undefined) throw new Error(`Board ${number}: dealer or vulnerability not found`);

    const hands: Record<string, string> = {};
    for (const seat of SEATS) hands[seat] = readHand(block, number, seat);

    const board: BoardFileV1 = {
      number,
      dealer,
      vul: parseVulnerability(vulText),
      hands,
      field: readField(block, number),
    };
    const par = readPar(block, number);
    if (par !== null) board.doubleDummy = { par: { nsScore: par } };
    const commentary = readCommentary(block, number);
    if (commentary) board.commentary = commentary;
    boards.push(board);
  });

  // Which field this copy of the page shows. The regular archive's heading is just "Top 50 Ranking"
  // (everyone): no label, as the Common Game itself doesn't name it. The 299er archive's is
  // "299ers Top 50 Ranking" (newer players only), labelled "299er" the way players say it.
  const heading = /<h2>\s*([^<]*?)\s*Top 50 Ranking\s*<\/h2>/.exec(html)?.[1]?.trim();
  const fieldName = heading ? heading.replace(/s$/, "") : undefined;
  const when = date ? formatDate(date) : fileName.replace(/\.[^.]+$/, "");

  return {
    schemaVersion: 1,
    id: `tcg-${date ?? "unknown"}${fieldName ? `-${fieldName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}` : ""}`,
    title: `The Common Game, ${when}${fieldName ? ` (${fieldName})` : ""}`,
    ...(date ? { date } : {}),
    source: {
      name: "The Common Game",
      url: "https://www.thecommongame.com",
      attribution: `Results from The Common Game, imported from ${fileName}`,
    },
    boards: boards.sort((a, b) => a.number - b.number),
  };
}

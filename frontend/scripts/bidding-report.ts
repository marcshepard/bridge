// The bidding report: the bots bid every board of a game file in all four seats, and this writes
// each auction with the reason for every call, the hard calls, and how the contracts score against
// the field (double dummy). For skimming the bidder's quality, and for catching a change that makes
// it worse (save a report, change the rules, compare).
//
//   npm run bidding-report                          the built-in demo game
//   npm run bidding-report -- path/to/game.pbn      any game file the app can import
//   npm run bidding-report -- game.pbn --board 14   one board
//
// Run from frontend/. The script is bundled with rolldown first (it imports the app's TypeScript).

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { auctionResult } from "../src/core/auction";
import { botAuction } from "../src/core/bidding/bidder";
import { callName } from "../src/core/bidding/sayc/common";
import { doubleDummyResult } from "../src/core/bidding/result";
import { compareBoard, scoreField } from "../src/core/compare";
import { formatContract } from "../src/core/contract";
import { handToString } from "../src/core/deal";
import { scoreResult } from "../src/core/scoring";
import { SEATS } from "../src/core/types";
import { parseGameFile } from "../src/providers/gameFile";
import { fileToGameFile } from "../src/providers/importFile";

const args = process.argv.slice(2);
const boardArg = args.indexOf("--board");
const only = boardArg >= 0 ? Number(args[boardArg + 1]) : null;
const file = args.find((a, i) => !a.startsWith("--") && (boardArg < 0 || i !== boardArg + 1)) ?? resolve(process.cwd(), "../backend/src/demo/demo-game.json");

const text = readFileSync(file, "utf8");
const game = parseGameFile(fileToGameFile(file, text));

let hard = 0;
let fallbacks = 0;
let mpTotal = 0;
let mpBoards = 0;
const lines: string[] = [`Bidding report: ${game.summary.title} (${file})`, ""];

for (const board of game.boards) {
  if (only !== null && board.number !== only) continue;
  const decisions = botAuction(board.hands, { dealer: board.dealer, vul: board.vul });
  const calls = decisions.map((d) => d.call);
  const end = auctionResult(board.dealer, calls);
  lines.push(`Board ${board.number}  dealer ${board.dealer}  vul ${board.vul}`);
  for (const s of SEATS) lines.push(`  ${s}  ${handToString(board.hands[s]).replace(/\./g, "  ")}`);
  let seat = board.dealer;
  decisions.forEach((d) => {
    const flags = [d.name, d.hard ? "HARD" : null, d.fallback ? "NO RULE" : null].filter(Boolean).join(", ");
    lines.push(`    ${seat}  ${callName(d.call).padEnd(8)} ${d.reason}${flags ? `  [${flags}]` : ""}`);
    if (d.hard) {
      hard++;
      lines.push(`          hard call: chose between ${d.hard.candidates.map(callName).join(", ")} by ${d.hard.rule}`);
    }
    if (d.fallback) fallbacks++;
    seat = SEATS[(SEATS.indexOf(seat) + 1) % 4]!;
  });
  const result = end ? doubleDummyResult(board.doubleDummy, end.contract, end.declarer) : null;
  const contract = end?.contract ? `${formatContract(end.contract)} by ${end.declarer}` : "Passed out";
  if (result) {
    const ns = scoreResult(result, board.vul);
    const nsScore = result.declarer === "E" || result.declarer === "W" ? -ns.declarerScore : ns.declarerScore;
    const c = compareBoard(result, "NS", board.vul, scoreField(board.field, board.vul));
    const par = board.doubleDummy?.par?.nsScore;
    lines.push(
      `  Contract ${contract}, ${result.contract ? `${result.tricks} tricks double dummy` : ""}: N/S ${nsScore >= 0 ? "+" : ""}${nsScore}` +
        (par !== undefined ? `, par ${par >= 0 ? "+" : ""}${par}` : "") +
        (c.mpPct !== null ? `, N/S ${c.mpPct.toFixed(0)}% against the field` : ""),
    );
    if (c.mpPct !== null) {
      mpTotal += c.mpPct;
      mpBoards++;
    }
  } else {
    lines.push(`  Contract ${contract} (no double dummy to score it)`);
  }
  lines.push("");
}

lines.push(
  `${only !== null || game.boards.length === 1 ? "1 board" : `${game.boards.length} boards`}: ${hard} hard calls, ${fallbacks} calls with no rule` +
    (mpBoards ? `, N/S average ${(mpTotal / mpBoards).toFixed(1)}% against the field (50% is the field's average)` : ""),
);
console.log(lines.join("\n"));

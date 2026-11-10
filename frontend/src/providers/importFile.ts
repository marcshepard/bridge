// Turning an uploaded file into our game file format, whatever the source.
//
// Each source has its own importer that produces `GameFileV1`; this only decides which one to use.
// Nothing after this point knows where a game came from.

import type { GameFileV1 } from "./gameFile";
import { looksLikeMhtml, mhtmlToHtml } from "./mhtml";
import { pbnToGameFile } from "./pbn";
import { looksLikeTcgPage, tcgPageToGameFile } from "./tcgPage";
import { looksLikeWebArchive, webArchiveToHtml } from "./webarchive";

/**
 * The kinds of file a game can be imported from, for the file picker. `.mht` and `.mhtml` are pages
 * saved by Chrome on Android (⋮ → Download); `.webarchive` (also by its type, for the iPhone and
 * iPad file picker) is a page saved by Safari.
 */
export const ACCEPTED_FILES = ".pbn,.txt,.json,.html,.htm,.mht,.mhtml,.webarchive,application/x-webarchive";

/**
 * Convert a file to our format. Decides by extension, falling back to sniffing the contents. Pass
 * the file's bytes (a Safari Web Archive is binary) or, for a text file, its text.
 */
export function fileToGameFile(fileName: string, contents: string | Uint8Array): GameFileV1 {
  if (typeof contents !== "string") {
    if (/\.webarchive$/i.test(fileName) || looksLikeWebArchive(contents)) return pageToGameFile(webArchiveToHtml(contents), fileName);
    contents = new TextDecoder("utf-8").decode(contents);
  }
  const text = contents;
  // A page saved as one file: take the page out of it, then read it like any saved page.
  if (/\.mht(ml)?$/i.test(fileName) || looksLikeMhtml(text)) return pageToGameFile(mhtmlToHtml(text), fileName);
  if (/\.html?$/i.test(fileName) || looksLikeTcgPage(text)) return pageToGameFile(text, fileName);
  if (/\.json$/i.test(fileName) || text.trimStart().startsWith("{")) {
    try {
      return JSON.parse(text) as GameFileV1;
    } catch {
      throw new Error("This JSON file couldn't be read");
    }
  }
  return pbnToGameFile(text, fileName);
}

function pageToGameFile(html: string, fileName: string): GameFileV1 {
  if (!looksLikeTcgPage(html)) {
    throw new Error("This web page isn't a Common Game results page. Save the page that shows the boards and results.");
  }
  return tcgPageToGameFile(html, fileName);
}

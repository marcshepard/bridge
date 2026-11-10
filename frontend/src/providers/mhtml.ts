// A web page saved as one file in MHTML form (.mht or .mhtml): what Chrome on Android saves with
// ⋮ → Download. It's a MIME message, like an email: headers, then parts separated by a boundary
// line, one for the page's HTML and one for each image and stylesheet. We take the page's HTML out
// and hand it to the importer for that page; the rest is ignored.

/** True when the text is a MIME message wrapping a web page (checked in its top headers only). */
export function looksLikeMhtml(text: string): boolean {
  const head = topHeaders(text);
  return /^mime-version:/im.test(head) && /^content-type:\s*multipart\/related/im.test(head);
}

/** The HTML of the saved page: the first text/html part, decoded. Throws if there's none. */
export function mhtmlToHtml(text: string): string {
  const head = unfold(topHeaders(text));
  const boundary = /boundary="?([^";\r\n]+)"?/i.exec(head)?.[1];
  if (!boundary) throw new Error("This saved page couldn't be read (no part boundary)");

  for (const part of text.split(`--${boundary}`).slice(1)) {
    const split = /\r?\n\r?\n/.exec(part);
    if (!split) continue;
    const headers = unfold(part.slice(0, split.index));
    const type = /^content-type:\s*([^;\s]+)/im.exec(headers)?.[1]?.toLowerCase();
    if (type !== "text/html") continue;
    const encoding = /^content-transfer-encoding:\s*(\S+)/im.exec(headers)?.[1]?.toLowerCase() ?? "binary";
    const charset = /charset="?([^";\s]+)"?/i.exec(headers)?.[1] ?? "utf-8";
    // The body runs to the next boundary; drop the line breaks before it (they belong to the boundary).
    const body = part.slice(split.index + split[0].length).replace(/(\r?\n)+$/, "");
    return decode(body, encoding, charset);
  }
  throw new Error("This saved page has no web page inside it");
}

/** The message's own headers: everything before the first blank line. */
function topHeaders(text: string): string {
  const end = /\r?\n\r?\n/.exec(text);
  return end ? text.slice(0, end.index) : text.slice(0, 2000);
}

/** Joins header lines that carry on onto the next line (those start with a space or tab). */
function unfold(headers: string): string {
  return headers.replace(/\r?\n[ \t]+/g, " ");
}

function decode(body: string, encoding: string, charset: string): string {
  // "binary", "8bit" and "7bit" are stored as they are: the file was already read as text.
  if (encoding === "quoted-printable") return bytesToText(quotedPrintableBytes(body), charset);
  if (encoding === "base64") return bytesToText(base64Bytes(body), charset);
  return body;
}

/** "=3D" is one byte written in hex; "=" at a line end joins two lines (a soft line break). */
function quotedPrintableBytes(body: string): Uint8Array {
  const text = body.replace(/=\r?\n/g, "");
  const bytes: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const hex = text[i] === "=" ? text.slice(i + 1, i + 3) : "";
    if (/^[0-9A-Fa-f]{2}$/.test(hex)) {
      bytes.push(parseInt(hex, 16));
      i += 2;
    } else {
      bytes.push(text.charCodeAt(i) & 0xff);
    }
  }
  return Uint8Array.from(bytes);
}

function base64Bytes(body: string): Uint8Array {
  return Uint8Array.from(atob(body.replace(/\s+/g, "")), (c) => c.charCodeAt(0));
}

function bytesToText(bytes: Uint8Array, charset: string): string {
  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    // An unknown charset label: UTF-8 is what Common Game pages use.
    return new TextDecoder("utf-8").decode(bytes);
  }
}

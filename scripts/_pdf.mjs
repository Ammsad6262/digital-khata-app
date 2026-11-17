/**
 * Minimal PDF text extractor for the code-inventory script.
 *
 * Only needs to handle the simple, generated PDFs the code exports are printed
 * as: uncompressed-or-Flate content streams with Tj/TJ text operators.  It is
 * NOT a general PDF reader and deliberately does no layout reconstruction
 * beyond inserting a newline after each text-showing operator group.
 */
import { readFileSync } from "node:fs";
import zlib from "node:zlib";

function inflate(buf) {
  try {
    return zlib.inflateSync(buf);
  } catch {
    try {
      return zlib.inflateRawSync(buf);
    } catch {
      return null;
    }
  }
}

function decodeText(content) {
  // Pull the string literals out of Tj / TJ operators, in order.
  let out = "";
  const re = /\((?:\\.|[^\\()])*\)|<([0-9A-Fa-f\s]+)>/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    if (m[1] !== undefined) {
      // hex string
      const hex = m[1].replace(/\s+/g, "");
      for (let i = 0; i + 1 < hex.length; i += 2) {
        out += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
      }
    } else {
      const s = m[0].slice(1, -1);
      out += s
        .replace(/\\([nrtbf()\\])/g, (_, c) =>
          c === "n" ? "\n" : c === "r" ? "\r" : c === "t" ? "\t" : c === "b" ? "\b" : c === "f" ? "\f" : c)
        .replace(/\\([0-7]{1,3})/g, (_, o) => String.fromCharCode(parseInt(o, 8)));
    }
  }
  return out;
}

export class PdfReader {
  constructor(file) {
    const buf = readFileSync(file);
    this.pages = [];
    const latin = buf.toString("latin1");

    // find each page object and its content stream
    const pageRe = /\/Type\s*\/Page\b[\s\S]*?stream\r?\n([\s\S]*?)\r?\nendstream/g;
    let m;
    while ((m = pageRe.exec(latin)) !== null) {
      const raw = Buffer.from(m[1], "latin1");
      let content = inflate(raw);
      if (!content) content = raw;
      const text = decodeText(content.toString("latin1"));
      this.pages.push({ text });
    }

    if (this.pages.length === 0) {
      // Streams without an explicit /Type /Page header: fall back to every stream.
      const streamRe = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
      while ((m = streamRe.exec(latin)) !== null) {
        const raw = Buffer.from(m[1], "latin1");
        const content = inflate(raw) ?? raw;
        this.pages.push({ text: decodeText(content.toString("latin1")) });
      }
    }
  }
}

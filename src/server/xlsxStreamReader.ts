/**
 * xlsxStreamReader
 * ─────────────────
 * Streaming xlsx row reader for files whose sheet XML is too large to
 * convert to a JS string (Node limit ~512 MB).
 *
 * Strategy:
 *   1. Inflate xl/sharedStrings.xml fully (typically < 50 MB — manageable)
 *   2. Inflate xl/worksheets/sheet1.xml into a Buffer (NOT a string)
 *   3. Scan the Buffer for <row> boundaries by searching for byte patterns
 *   4. Convert only one row at a time to a string for cell parsing
 *
 * This way we never create a single string longer than one row's worth of XML,
 * regardless of how large the total sheet is.
 */
import { inflateRaw } from "node:zlib";
import { promisify } from "node:util";

const inflateRawAsync = promisify(inflateRaw);

// byte sequences we search for
const ROW_OPEN  = Buffer.from("<row ");
const ROW_CLOSE = Buffer.from("</row>");
const SD_OPEN   = Buffer.from("<sheetData");
const SD_CLOSE  = Buffer.from("</sheetData>");

// ─── ZIP entry scanner ────────────────────────────────────────────────────────

interface ZipEntry { dataOffset: number; compressedSize: number; compression: number }

function findZipEntry(buf: Buffer, name: string): ZipEntry | null {
  let offset = 0;
  while (offset + 30 < buf.length) {
    if (buf.readUInt32LE(offset) !== 0x04034b50) { offset++; continue; }
    const compression  = buf.readUInt16LE(offset + 8);
    const compressedSz = buf.readUInt32LE(offset + 18);
    const nameLen      = buf.readUInt16LE(offset + 26);
    const extraLen     = buf.readUInt16LE(offset + 28);
    const entryName    = buf.slice(offset + 30, offset + 30 + nameLen).toString("utf-8");
    const dataOffset   = offset + 30 + nameLen + extraLen;
    if (entryName === name) return { dataOffset, compressedSize: compressedSz, compression };
    offset = dataOffset + compressedSz;
  }
  return null;
}

async function inflateEntry(zipBuf: Buffer, entry: ZipEntry): Promise<Buffer> {
  const data = zipBuf.slice(entry.dataOffset, entry.dataOffset + entry.compressedSize);
  if (entry.compression === 0) return data;
  if (entry.compression === 8) return inflateRawAsync(data) as unknown as Buffer;
  throw new Error(`Unsupported zip compression: ${entry.compression}`);
}

// ─── Buffer byte-search helper ────────────────────────────────────────────────

function indexOf(haystack: Buffer, needle: Buffer, from = 0): number {
  return haystack.indexOf(needle, from);
}

// ─── Shared strings ───────────────────────────────────────────────────────────

function parseSharedStrings(xml: string): string[] {
  const strings: string[] = [];
  const siRe = /<si>([\s\S]*?)<\/si>/g;
  const tRe  = /<t[^>]*>([\s\S]*?)<\/t>/g;
  let si: RegExpExecArray | null;
  while ((si = siRe.exec(xml)) !== null) {
    let text = "";
    let t: RegExpExecArray | null;
    tRe.lastIndex = 0;
    while ((t = tRe.exec(si[1])) !== null) text += t[1];
    strings.push(decode(text));
  }
  return strings;
}

// ─── Cell parsing ─────────────────────────────────────────────────────────────

function decode(s: string): string {
  return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}

function colIndex(col: string): number {
  let n = 0;
  for (const ch of col.toUpperCase()) n = n * 26 + ch.charCodeAt(0) - 64;
  return n - 1;
}

function parseCells(rowXml: string, ss: string[]): Array<{ col: number; value: string }> {
  const cells: Array<{ col: number; value: string }> = [];
  const cRe = /<c\s([^>]*)>([\s\S]*?)<\/c>/g;
  let m: RegExpExecArray | null;
  while ((m = cRe.exec(rowXml)) !== null) {
    const attrs = m[1], inner = m[2];
    const rM = /\br="([A-Z]+)\d+"/.exec(attrs);
    if (!rM) continue;
    const col  = colIndex(rM[1]);
    const type = (/\bt="([^"]*)"/.exec(attrs) ?? [])[1] ?? "";
    let value = "";
    if (type === "s") {
      const v = /<v>(\d+)<\/v>/.exec(inner);
      if (v) value = ss[parseInt(v[1], 10)] ?? "";
    } else if (type === "inlineStr") {
      const t = /<t[^>]*>([\s\S]*?)<\/t>/.exec(inner);
      if (t) value = decode(t[1]);
    } else {
      const v = /<v>([\s\S]*?)<\/v>/.exec(inner);
      if (v) value = decode(v[1]);
    }
    cells.push({ col, value });
  }
  return cells;
}

// ─── Buffer row iterator ──────────────────────────────────────────────────────

/**
 * Walk a Buffer of sheet XML and call onRow for every <row>…</row> element.
 * Converts only one row at a time to string — safe for 700+ MB buffers.
 */
function iterateRows(
  xmlBuf: Buffer,
  ss: string[],
  onRow: (cells: Array<{ col: number; value: string }>) => boolean // return false to stop
): void {
  // Find start of <sheetData>
  let pos = indexOf(xmlBuf, SD_OPEN);
  if (pos === -1) return;
  // Find end of <sheetData>
  const sdEnd = indexOf(xmlBuf, SD_CLOSE, pos);

  while (pos < (sdEnd === -1 ? xmlBuf.length : sdEnd)) {
    const rowStart = indexOf(xmlBuf, ROW_OPEN, pos);
    if (rowStart === -1 || (sdEnd !== -1 && rowStart >= sdEnd)) break;

    const rowEnd = indexOf(xmlBuf, ROW_CLOSE, rowStart);
    if (rowEnd === -1) break;

    // Extract just this row as a string
    const rowXml = xmlBuf.slice(rowStart, rowEnd + ROW_CLOSE.length).toString("utf-8");
    const cells  = parseCells(rowXml, ss);
    if (cells.length > 0) {
      const cont = onRow(cells);
      if (!cont) return;
    }
    pos = rowEnd + ROW_CLOSE.length;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface XlsxReadResult {
  headers: string[];
  rows: Record<string, unknown>[];
}

/** Read all rows — headers from row 1, data from rows 2+. */
export async function readXlsxRowsStreaming(buffer: Buffer): Promise<XlsxReadResult> {
  const ssEntry = findZipEntry(buffer, "xl/sharedStrings.xml");
  const ss: string[] = ssEntry
    ? parseSharedStrings((await inflateEntry(buffer, ssEntry)).toString("utf-8"))
    : [];

  const shEntry = findZipEntry(buffer, "xl/worksheets/sheet1.xml");
  if (!shEntry) throw new Error("sheet1.xml not found in xlsx");
  const shBuf = await inflateEntry(buffer, shEntry);

  let headers: string[] = [];
  const rows: Record<string, unknown>[] = [];
  let isFirst = true;

  iterateRows(shBuf, ss, (cells) => {
    if (isFirst) {
      const max = Math.max(...cells.map(c => c.col));
      headers = Array(max + 1).fill("") as string[];
      for (const c of cells) headers[c.col] = c.value;
      isFirst = false;
      return true;
    }
    const row: Record<string, unknown> = {};
    for (const c of cells) { const h = headers[c.col]; if (h) row[h] = c.value; }
    rows.push(row);
    return true;
  });

  return { headers, rows };
}

/** Read only the header row — stops after row 1 for speed. */
export async function readXlsxHeadersOnly(buffer: Buffer): Promise<string[]> {
  const ssEntry = findZipEntry(buffer, "xl/sharedStrings.xml");
  const ss: string[] = ssEntry
    ? parseSharedStrings((await inflateEntry(buffer, ssEntry)).toString("utf-8"))
    : [];

  const shEntry = findZipEntry(buffer, "xl/worksheets/sheet1.xml");
  if (!shEntry) return [];
  const shBuf = await inflateEntry(buffer, shEntry);

  let headers: string[] = [];
  iterateRows(shBuf, ss, (cells) => {
    const max = Math.max(...cells.map(c => c.col));
    const h   = Array(max + 1).fill("") as string[];
    for (const c of cells) h[c.col] = c.value;
    headers = h.filter(Boolean);
    return false; // stop after first row
  });

  return headers;
}

/**
 * Minimal XLSX reader/writer — replaces the xlsx npm package.
 * XLSX files are ZIP archives containing XML. Uses our local zip.ts.
 */

import { readZip, writeZip, ZipEntry } from './zip';

// ── Types ───────────────────────────────────────────────────────────────────

export interface XlsxWorkbook {
  sheetNames: string[];
  sheets: Record<string, string[][]>;
}

// ── Reader ──────────────────────────────────────────────────────────────────

const textDecoder = new TextDecoder();

function parseXml(text: string): Document {
  return new DOMParser().parseFromString(text, 'application/xml');
}

function getFileText(entries: ZipEntry[], name: string): string | null {
  const entry = entries.find(e => e.name === name);
  return entry ? textDecoder.decode(entry.data) : null;
}

/** Read shared strings from xl/sharedStrings.xml */
function readSharedStrings(entries: ZipEntry[]): string[] {
  const xml = getFileText(entries, 'xl/sharedStrings.xml');
  if (!xml) return [];

  const doc = parseXml(xml);
  const strings: string[] = [];
  const siElements = doc.getElementsByTagName('si');

  for (let i = 0; i < siElements.length; i++) {
    // An <si> can contain a single <t> or multiple <r><t> (rich text runs)
    const tElements = siElements[i].getElementsByTagName('t');
    let text = '';
    for (let j = 0; j < tElements.length; j++) {
      text += tElements[j].textContent ?? '';
    }
    strings.push(text);
  }

  return strings;
}

/** Read sheet names from xl/workbook.xml */
function readSheetNames(entries: ZipEntry[]): string[] {
  const xml = getFileText(entries, 'xl/workbook.xml');
  if (!xml) return [];

  const doc = parseXml(xml);
  const sheets = doc.getElementsByTagName('sheet');
  const names: string[] = [];
  for (let i = 0; i < sheets.length; i++) {
    names.push(sheets[i].getAttribute('name') ?? `Sheet${i + 1}`);
  }
  return names;
}

/** Convert column letter(s) to 0-based index: A=0, B=1, ..., Z=25, AA=26 */
function colToIndex(col: string): number {
  let index = 0;
  for (let i = 0; i < col.length; i++) {
    index = index * 26 + (col.charCodeAt(i) - 64);
  }
  return index - 1;
}

/** Parse a cell reference like "A1" or "AB123" into { col, row } (0-based) */
function parseCellRef(ref: string): { col: number; row: number } {
  const match = ref.match(/^([A-Z]+)(\d+)$/);
  if (!match) return { col: 0, row: 0 };
  return { col: colToIndex(match[1]), row: parseInt(match[2]) - 1 };
}

/**
 * Attempt to convert Excel serial date number to a formatted date string.
 * Excel stores dates as days since 1900-01-01 (with a Lotus 1-2-3 bug where 1900 is leap year).
 */
function excelDateToString(serial: number): string {
  if (serial < 1 || serial > 2958465) return String(serial); // out of range
  // Adjust for Lotus 1-2-3 leap year bug (Feb 29, 1900 doesn't exist)
  const adjusted = serial > 60 ? serial - 1 : serial;
  const epoch = new Date(1900, 0, 1);
  const date = new Date(epoch.getTime() + (adjusted - 1) * 86400000);
  if (isNaN(date.getTime())) return String(serial);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Read a single worksheet into a 2D string array */
function readSheet(
  entries: ZipEntry[],
  sheetPath: string,
  sharedStrings: string[],
  dateFormats: Set<number>,
  cellFormats: Map<number, number>,
): string[][] {
  const xml = getFileText(entries, sheetPath);
  if (!xml) return [];

  const doc = parseXml(xml);
  const rows: string[][] = [];
  const rowElements = doc.getElementsByTagName('row');

  for (let ri = 0; ri < rowElements.length; ri++) {
    const rowEl = rowElements[ri];
    const rowNum = parseInt(rowEl.getAttribute('r') ?? '1') - 1;

    // Ensure rows array is large enough
    while (rows.length <= rowNum) rows.push([]);

    const cells = rowEl.getElementsByTagName('c');
    for (let ci = 0; ci < cells.length; ci++) {
      const cell = cells[ci];
      const ref = cell.getAttribute('r') ?? '';
      const type = cell.getAttribute('t') ?? '';
      const styleIdx = parseInt(cell.getAttribute('s') ?? '-1');
      const { col } = parseCellRef(ref);

      // Ensure row is wide enough
      while (rows[rowNum].length <= col) rows[rowNum].push('');

      const vEl = cell.getElementsByTagName('v')[0];
      let value = vEl?.textContent ?? '';

      if (type === 's') {
        // Shared string index
        const idx = parseInt(value);
        value = sharedStrings[idx] ?? value;
      } else if (type === 'inlineStr') {
        // Inline string
        const tEl = cell.getElementsByTagName('t')[0];
        value = tEl?.textContent ?? '';
      } else if (!type || type === 'n') {
        // Number — check if it's a date format
        const numVal = parseFloat(value);
        if (!isNaN(numVal) && styleIdx >= 0) {
          const fmtId = cellFormats.get(styleIdx);
          if (fmtId !== undefined && dateFormats.has(fmtId)) {
            value = excelDateToString(numVal);
          }
        }
      }

      rows[rowNum][col] = value;
    }
  }

  return rows;
}

/** Built-in Excel number format IDs that represent dates */
const BUILTIN_DATE_FMTS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58]);

/** Read styles.xml to detect date number formats */
function readDateFormats(entries: ZipEntry[]): { dateFormats: Set<number>; cellFormats: Map<number, number> } {
  const dateFormats = new Set(BUILTIN_DATE_FMTS);
  const cellFormats = new Map<number, number>();

  const xml = getFileText(entries, 'xl/styles.xml');
  if (!xml) return { dateFormats, cellFormats };

  const doc = parseXml(xml);

  // Check custom numFmts for date-like patterns
  const numFmts = doc.getElementsByTagName('numFmt');
  for (let i = 0; i < numFmts.length; i++) {
    const id = parseInt(numFmts[i].getAttribute('numFmtId') ?? '0');
    const code = (numFmts[i].getAttribute('formatCode') ?? '').toLowerCase();
    // Heuristic: date formats contain d, m, y tokens
    if (/[dmy]/.test(code) && !/[#0]/.test(code)) {
      dateFormats.add(id);
    }
  }

  // Read cellXfs to map style index → numFmtId
  const xfElements = doc.getElementsByTagName('cellXfs')[0]?.getElementsByTagName('xf');
  if (xfElements) {
    for (let i = 0; i < xfElements.length; i++) {
      const fmtId = parseInt(xfElements[i].getAttribute('numFmtId') ?? '0');
      cellFormats.set(i, fmtId);
    }
  }

  return { dateFormats, cellFormats };
}

/** Read sheet relationship mappings from xl/_rels/workbook.xml.rels */
function readSheetRels(entries: ZipEntry[]): Map<string, string> {
  const xml = getFileText(entries, 'xl/_rels/workbook.xml.rels');
  if (!xml) return new Map();

  const doc = parseXml(xml);
  const rels = new Map<string, string>();
  const relElements = doc.getElementsByTagName('Relationship');

  for (let i = 0; i < relElements.length; i++) {
    const id = relElements[i].getAttribute('Id') ?? '';
    const target = relElements[i].getAttribute('Target') ?? '';
    rels.set(id, target.startsWith('/') ? target.slice(1) : `xl/${target}`);
  }

  return rels;
}

export async function readXlsx(buffer: ArrayBuffer): Promise<XlsxWorkbook> {
  const entries = await readZip(buffer);
  const sharedStrings = readSharedStrings(entries);
  const sheetNames = readSheetNames(entries);
  const { dateFormats, cellFormats } = readDateFormats(entries);
  const rels = readSheetRels(entries);

  // Map sheet names to file paths via workbook.xml rId references
  const workbookXml = getFileText(entries, 'xl/workbook.xml');
  const wbDoc = workbookXml ? parseXml(workbookXml) : null;
  const sheetElements = wbDoc?.getElementsByTagName('sheet');

  const sheets: Record<string, string[][]> = {};
  for (let i = 0; i < sheetNames.length; i++) {
    const name = sheetNames[i];

    // Try to resolve path via relationship ID
    let path = `xl/worksheets/sheet${i + 1}.xml`;
    if (sheetElements && sheetElements[i]) {
      const rId = sheetElements[i].getAttribute('r:id') ?? '';
      if (rId && rels.has(rId)) {
        path = rels.get(rId)!;
      }
    }

    sheets[name] = readSheet(entries, path, sharedStrings, dateFormats, cellFormats);
  }

  return { sheetNames, sheets };
}

// ── Writer ──────────────────────────────────────────────────────────────────

const textEncoder = new TextEncoder();

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Convert 0-based column index to Excel letter: 0=A, 25=Z, 26=AA */
function indexToCol(index: number): string {
  let col = '';
  let n = index;
  while (n >= 0) {
    col = String.fromCharCode((n % 26) + 65) + col;
    n = Math.floor(n / 26) - 1;
  }
  return col;
}

export interface XlsxWriteSheet {
  data: (string | number | undefined)[][];
  colWidths?: number[];
}

export function writeXlsx(sheets: { name: string; sheet: XlsxWriteSheet }[]): ArrayBuffer {
  const files: { name: string; data: Uint8Array }[] = [];

  // [Content_Types].xml
  let contentTypes = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>' +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>';

  for (let i = 0; i < sheets.length; i++) {
    contentTypes += `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`;
  }
  contentTypes += '</Types>';
  files.push({ name: '[Content_Types].xml', data: textEncoder.encode(contentTypes) });

  // _rels/.rels
  files.push({
    name: '_rels/.rels',
    data: textEncoder.encode(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      '</Relationships>'
    ),
  });

  // xl/_rels/workbook.xml.rels
  let wbRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">';
  for (let i = 0; i < sheets.length; i++) {
    wbRels += `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`;
  }
  wbRels += `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>`;
  wbRels += `<Relationship Id="rId${sheets.length + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`;
  wbRels += '</Relationships>';
  files.push({ name: 'xl/_rels/workbook.xml.rels', data: textEncoder.encode(wbRels) });

  // Collect all unique strings across all sheets
  const stringMap = new Map<string, number>();
  const sharedStrings: string[] = [];
  function getStringIndex(s: string): number {
    let idx = stringMap.get(s);
    if (idx === undefined) {
      idx = sharedStrings.length;
      sharedStrings.push(s);
      stringMap.set(s, idx);
    }
    return idx;
  }

  // xl/workbook.xml
  let workbook = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<sheets>';
  for (let i = 0; i < sheets.length; i++) {
    workbook += `<sheet name="${escapeXml(sheets[i].name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`;
  }
  workbook += '</sheets></workbook>';
  files.push({ name: 'xl/workbook.xml', data: textEncoder.encode(workbook) });

  // xl/styles.xml (minimal)
  files.push({
    name: 'xl/styles.xml',
    data: textEncoder.encode(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>' +
      '<fills count="1"><fill><patternFill patternType="none"/></fill></fills>' +
      '<borders count="1"><border/></borders>' +
      '<cellStyleXfs count="1"><xf/></cellStyleXfs>' +
      '<cellXfs count="1"><xf/></cellXfs>' +
      '</styleSheet>'
    ),
  });

  // Generate worksheet files
  for (let si = 0; si < sheets.length; si++) {
    const { data, colWidths } = sheets[si].sheet;

    let ws = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">';

    // Column widths
    if (colWidths && colWidths.length > 0) {
      ws += '<cols>';
      for (let c = 0; c < colWidths.length; c++) {
        ws += `<col min="${c + 1}" max="${c + 1}" width="${colWidths[c]}" customWidth="1"/>`;
      }
      ws += '</cols>';
    }

    ws += '<sheetData>';

    for (let r = 0; r < data.length; r++) {
      const row = data[r];
      ws += `<row r="${r + 1}">`;

      for (let c = 0; c < row.length; c++) {
        const val = row[c];
        const ref = `${indexToCol(c)}${r + 1}`;

        if (val === undefined || val === null || val === '') {
          continue;
        } else if (typeof val === 'number') {
          ws += `<c r="${ref}"><v>${val}</v></c>`;
        } else {
          const idx = getStringIndex(String(val));
          ws += `<c r="${ref}" t="s"><v>${idx}</v></c>`;
        }
      }

      ws += '</row>';
    }

    ws += '</sheetData></worksheet>';
    files.push({ name: `xl/worksheets/sheet${si + 1}.xml`, data: textEncoder.encode(ws) });
  }

  // xl/sharedStrings.xml
  let ss = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${sharedStrings.length}" uniqueCount="${sharedStrings.length}">`;
  for (const s of sharedStrings) {
    ss += `<si><t>${escapeXml(s)}</t></si>`;
  }
  ss += '</sst>';
  files.push({ name: 'xl/sharedStrings.xml', data: textEncoder.encode(ss) });

  return writeZip(files);
}

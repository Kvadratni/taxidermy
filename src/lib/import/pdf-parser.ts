/**
 * Client-side PDF text extraction and E*TRADE confirmation parsing.
 * Handles three document types:
 *   1. Trade Confirmations (sell-to-cover and manual sells)
 *   2. RSU Release Confirmations
 *   3. ESPP Purchase Confirmations
 *
 * Uses pdfjs-dist which runs entirely in the browser — no server needed.
 * NOTE: pdfjs-dist outputs properly spaced text (unlike pdf-parse which
 * often concatenates words). All regex patterns are written for spaced text.
 */

import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import type { TextItem } from 'pdfjs-dist/types/src/display/api';

// Use the bundled worker
GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url,
).toString();

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PdfTransaction {
  date: string;            // YYYY-MM-DD (trade date)
  settlementDate?: string; // YYYY-MM-DD (settlement date — used for FX conversion per CRA rules)
  action: string;          // BUY or SELL
  symbol: string;
  quantity: number;
  price: number;           // per share
  commission: number;
  currency: string;
  docType: 'trade' | 'rsu' | 'espp';
  sharesSold?: number;
  purchaseValuePerShare?: number;
}

// ---------------------------------------------------------------------------
// Text extraction
// ---------------------------------------------------------------------------

async function extractText(buffer: ArrayBuffer): Promise<string> {
  const doc = await getDocument({
    data: new Uint8Array(buffer),
    disableFontFace: true,
    useSystemFonts: false,
    verbosity: 0,
  }).promise;

  let fullText = '';
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .filter((item): item is TextItem => 'str' in item)
      .map((item) => item.str)
      .join(' ');
    fullText += pageText + '\n';
  }
  return fullText;
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

const MONTHS: Record<string, string> = {
  january: '01', february: '02', march: '03', april: '04',
  may: '05', june: '06', july: '07', august: '08',
  september: '09', october: '10', november: '11', december: '12',
  jan: '01', feb: '02', mar: '03', apr: '04',
  jun: '06', jul: '07', aug: '08', sep: '09',
  oct: '10', nov: '11', dec: '12',
};

function normalizeDate(raw: string): string {
  const s = raw.trim().replace(/,/g, '');
  const iso = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
  const mdy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (mdy) return `${mdy[3]}-${mdy[1].padStart(2, '0')}-${mdy[2].padStart(2, '0')}`;
  const mdy2 = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2})$/);
  if (mdy2) {
    const yr = parseInt(mdy2[3]) > 50 ? `19${mdy2[3]}` : `20${mdy2[3]}`;
    return `${yr}-${mdy2[1].padStart(2, '0')}-${mdy2[2].padStart(2, '0')}`;
  }
  const mf = s.match(/^([A-Za-z]+)\s+(\d{1,2})\s+(\d{4})$/);
  if (mf) { const mon = MONTHS[mf[1].toLowerCase()]; if (mon) return `${mf[3]}-${mon}-${mf[2].padStart(2, '0')}`; }
  const df = s.match(/^(\d{1,2})[\s\-]([A-Za-z]+)[\s\-](\d{4})$/);
  if (df) { const mon = MONTHS[df[2].toLowerCase()]; if (mon) return `${df[3]}-${mon}-${df[1].padStart(2, '0')}`; }
  return s;
}

// ---------------------------------------------------------------------------
// Document type detection
// ---------------------------------------------------------------------------

type DocType = 'trade' | 'rsu' | 'espp' | 'unknown';

function detectDocType(text: string): DocType {
  if (/EMPLOYEE STOCK PLAN PURCHASE CONFIRMATION/i.test(text) || /Plan\s+ESPP/i.test(text)) return 'espp';
  if (/EMPLOYEE STOCK PLAN RELEASE CONFIRMATION/i.test(text) || /Release\s+Summary/i.test(text)) return 'rsu';
  // Newer Morgan Stanley format
  if (/Transaction\s+Type:\s*(Sold|Bought)/i.test(text)) return 'trade';
  // Older E*TRADE format
  if (/TRADE\s+CONFIRMATION/i.test(text) && /(?:SELL|BUY)\s+\d+/i.test(text)) return 'trade';
  return 'unknown';
}

// ---------------------------------------------------------------------------
// Parser: Trade Confirmations
// ---------------------------------------------------------------------------

function parseTrade(text: string, fileName: string): PdfTransaction | null {
  // Detect older format by presence of "TRADE CONFIRMATION" header with tabular layout
  if (/TRADE\s+CONFIRMATION/i.test(text) && /TRADE\s+DATE\s+SETL\s+DATE/i.test(text)) {
    return parseTradeOlder(text, fileName);
  }
  return parseTradeNewer(text, fileName);
}

/**
 * Newer E*TRADE/Morgan Stanley trade confirmations (2024+).
 * pdfjs-dist output has spaces between fields:
 *   "02/21/2024   02/23/2024   1   63.88"
 * Or sometimes concatenated when PDF layout is tight:
 *   "01/02/202401/04/20242273.791375"
 */
function parseTradeNewer(text: string, fileName: string): PdfTransaction | null {
  // Action
  const typeMatch = text.match(/Transaction\s+Type:\s*(Sold(?:\s+Short)?|Bought)/i);
  if (!typeMatch) return null;
  const action = /bought/i.test(typeMatch[1]) ? 'BUY' : 'SELL';

  // Symbol
  const symMatch = text.match(/Symbol\s*\/\s*CUSIP\s*\/\s*ISIN:\s*([A-Z]{1,5})\s*\//i);
  const symbol = symMatch ? symMatch[1].toUpperCase() : 'UNKNOWN';

  // Principal
  const principalMatch = text.match(/Principal\s+\$([\d,]+\.?\d*)/i);
  const principal = principalMatch ? parseFloat(principalMatch[1].replace(/,/g, '')) : 0;

  // Fee
  const feeMatch = text.match(/(?:Transaction\s+Fee|Fee)\s+\$([\d,]+\.?\d*)/i);
  const commission = feeMatch ? parseFloat(feeMatch[1].replace(/,/g, '')) : 0;

  let tradeDate = '';
  let settlementDate = '';
  let quantity = 0;
  let price = 0;

  // Try spaced format first (most common with pdfjs-dist):
  // "MM/DD/YYYY   MM/DD/YYYY   QTY   PRICE..."
  const spacedMatch = text.match(
    /(\d{2}\/\d{2}\/\d{4})\s+(\d{2}\/\d{2}\/\d{4})\s+(\d+)\s+([\d,.]+)/
  );
  if (spacedMatch) {
    tradeDate = normalizeDate(spacedMatch[1]);
    settlementDate = normalizeDate(spacedMatch[2]);
    quantity = parseInt(spacedMatch[3]);
    // Price might have extra digits (e.g. "63.88" or "73.791375")
    // Take just the price portion (up to 2 decimal places for display)
    const rawPrice = parseFloat(spacedMatch[4].replace(/,/g, ''));
    price = rawPrice;

    // Validate against principal if available
    if (principal > 0 && quantity > 0) {
      const computed = quantity * price;
      // If raw price has more than 2 decimals, it might include settlement amount
      // Recompute: price = principal / quantity
      if (Math.abs(computed - principal) / principal > 0.01) {
        price = principal / quantity;
      }
    }
  }

  // Fallback: concatenated format (no spaces between dates/data)
  if (!tradeDate) {
    const concatMatch = text.match(/(\d{2}\/\d{2}\/\d{4})(\d{2}\/\d{2}\/\d{4})(\d[\d.]+)/);
    if (concatMatch && principal > 0) {
      tradeDate = normalizeDate(concatMatch[1]);
      settlementDate = normalizeDate(concatMatch[2]);
      const concatData = concatMatch[3];
      const dotIdx = concatData.indexOf('.');
      if (dotIdx > 0) {
        for (let splitAt = 1; splitAt <= dotIdx; splitAt++) {
          const tryQty = parseInt(concatData.substring(0, splitAt));
          const priceStr = concatData.substring(splitAt);
          const priceDotIdx = priceStr.indexOf('.');
          if (priceDotIdx < 0) continue;
          const tryPrice = parseFloat(priceStr.substring(0, priceDotIdx + 3));
          if (isNaN(tryQty) || isNaN(tryPrice) || tryQty <= 0 || tryPrice <= 0) continue;
          if (Math.abs(tryQty * tryPrice - principal) / principal < 0.005) {
            quantity = tryQty;
            price = tryPrice;
            break;
          }
        }
      }
    }
  }

  // Fallback: if we have principal but no quantity, try to find qty from text
  if (quantity === 0 && principal > 0) {
    // Single share case: principal IS the price
    const singleMatch = text.match(/Quantity\s+Price[\s\S]*?(\d{2}\/\d{2}\/\d{4})\s+\d{2}\/\d{2}\/\d{4}\s+(\d+)\s/);
    if (singleMatch) {
      tradeDate = normalizeDate(singleMatch[1]);
      quantity = parseInt(singleMatch[2]);
      price = principal / quantity;
    }
  }

  // Fallback date from filename _MMDDYY
  if (!tradeDate) {
    const fnMatch = fileName.match(/_(\d{6})(?:_\d+)?\.pdf$/i);
    if (fnMatch) {
      const d = fnMatch[1];
      tradeDate = normalizeDate(`${d.substring(0, 2)}/${d.substring(2, 4)}/${d.substring(4, 6)}`);
    }
  }

  if (!tradeDate || quantity === 0) return null;

  return {
    date: tradeDate, settlementDate: settlementDate || undefined, action, symbol, quantity,
    price: Math.round(price * 100) / 100,
    commission, currency: 'USD', docType: 'trade',
  };
}

/**
 * Older E*TRADE trade confirmations (pre-2024).
 * pdfjs-dist output (spaced):
 *   "04/18/22   04/20/22   6 1   SQ   SELL   110   $120.90   Stock Plan   PRINCIPAL   $13,299.00"
 * The "6 1" is MKT/CPT codes. Pattern:
 *   DATE   DATE   MKT CPT   SYMBOL   SELL/BUY   QTY   $PRICE   ...   PRINCIPAL   $AMOUNT
 */
function parseTradeOlder(text: string, fileName: string): PdfTransaction | null {
  // Match the data row with flexible spacing
  const rowMatch = text.match(
    /(\d{2}\/\d{2}\/\d{2})\s+(\d{2}\/\d{2}\/\d{2})\s+\d\s+\d\s+([A-Z]{1,5})\s+(SELL|BUY)\s+(\d+)\s+\$([\d,.]+)/i
  );
  if (!rowMatch) return null;

  const tradeDate = normalizeDate(rowMatch[1]);
  const settlementDate = normalizeDate(rowMatch[2]);
  const symbol = rowMatch[3].toUpperCase();
  const action = rowMatch[4].toUpperCase() === 'BUY' ? 'BUY' : 'SELL';
  const quantity = parseInt(rowMatch[5]);
  const price = parseFloat(rowMatch[6].replace(/,/g, ''));

  // Fee
  const feeMatch = text.match(/FEE\s+\$([\d,.]+)/i);
  const commission = feeMatch ? parseFloat(feeMatch[1].replace(/,/g, '')) : 0;

  if (!tradeDate || quantity <= 0 || price <= 0) return null;

  return {
    date: tradeDate, settlementDate, action, symbol, quantity,
    price: Math.round(price * 100) / 100,
    commission, currency: 'USD', docType: 'trade',
  };
}

// ---------------------------------------------------------------------------
// Parser: RSU Release Confirmations
// ---------------------------------------------------------------------------

function parseRsu(text: string): PdfTransaction | null {
  // Release Date — with flexible whitespace
  const dateMatch = text.match(/Release\s+Date\s+(\d{2}-\d{2}-\d{4})/);
  if (!dateMatch) return null;
  const date = normalizeDate(dateMatch[1]);

  // Shares Released
  const sharesMatch = text.match(/Shares\s+Released\s+([\d,]+\.?\d*)/);
  if (!sharesMatch) return null;
  const quantity = parseFloat(sharesMatch[1].replace(/,/g, ''));

  // Market Value Per Share
  const mvMatch = text.match(/Market\s+Value\s+Per\s+Share\s+\$?([\d,]+\.\d+)/);
  if (!mvMatch) return null;
  const price = parseFloat(mvMatch[1].replace(/,/g, ''));

  // Shares Sold (sell-to-cover)
  const soldMatch = text.match(/Shares\s+Sold\s+\(?([\d,]+\.?\d*)\)?/);
  const sharesSold = soldMatch ? parseFloat(soldMatch[1].replace(/,/g, '')) : 0;

  // Symbol — greedy .* to skip past "( FKA SQUARE, INC.)" and reach "(SQ)"
  const symMatch = text.match(/Company\s+Name\s+\(Symbol\)\s+.*\(([A-Z]{1,5})\)\s+(?:Plan|Award)/i);
  const symbol = symMatch ? symMatch[1].toUpperCase() : 'UNKNOWN';

  if (quantity <= 0 || price <= 0) return null;

  return { date, action: 'BUY', symbol, quantity, price, commission: 0, currency: 'USD', docType: 'rsu', sharesSold };
}

// ---------------------------------------------------------------------------
// Parser: ESPP Purchase Confirmations
// ---------------------------------------------------------------------------

function parseEspp(text: string): PdfTransaction | null {
  // Purchase Date
  const dateMatch = text.match(/Purchase\s+Date\s+(\d{2}-\d{2}-\d{4})/);
  if (!dateMatch) return null;
  const date = normalizeDate(dateMatch[1]);

  // Shares Purchased
  const sharesMatch = text.match(/Shares\s+Purchased\s+([\d,]+\.?\d*)/);
  if (!sharesMatch) return null;
  const quantity = parseFloat(sharesMatch[1].replace(/,/g, ''));

  // Purchase Price per Share (discounted price)
  const purchasePriceMatch = text.match(/Purchase\s+Price\s+per\s+Share[^$]*\$([\d,]+\.\d+)/);
  const purchasePrice = purchasePriceMatch ? parseFloat(purchasePriceMatch[1].replace(/,/g, '')) : 0;

  // Purchase Value per Share (FMV on purchase date)
  const fmvMatch = text.match(/Purchase\s+Value\s+per\s+Share\s+\$?([\d,]+\.\d+)/);
  const purchaseValuePerShare = fmvMatch ? parseFloat(fmvMatch[1].replace(/,/g, '')) : 0;

  // Symbol — greedy .* to skip past "( FKA SQUARE, INC.)" and reach "(SQ)"
  const symMatch = text.match(/Company\s+Name\s+\(Symbol\)\s+.*\(([A-Z]{1,5})\)\s+(?:Plan|Award)/i);
  const symbol = symMatch ? symMatch[1].toUpperCase() : 'UNKNOWN';

  if (quantity <= 0) return null;

  // ACB = FMV (employment benefit is taxable income added to cost base)
  const price = purchaseValuePerShare > 0 ? purchaseValuePerShare : purchasePrice;

  return { date, action: 'BUY', symbol, quantity, price, commission: 0, currency: 'USD', docType: 'espp', purchaseValuePerShare };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface PdfParseResult {
  transaction: PdfTransaction | null;
  docType: DocType;
  textPreview: string;
  error?: string;
}

export async function parsePdf(file: File): Promise<PdfParseResult> {
  try {
    const buffer = await file.arrayBuffer();
    const text = await extractText(buffer);
    const docType = detectDocType(text);

    let transaction: PdfTransaction | null = null;
    switch (docType) {
      case 'trade': transaction = parseTrade(text, file.name); break;
      case 'rsu': transaction = parseRsu(text); break;
      case 'espp': transaction = parseEspp(text); break;
    }

    const keywords = ['sold', 'bought', 'trade', 'release', 'purchase', 'shares', 'price'];
    let previewStart = 0;
    const lower = text.toLowerCase();
    for (const kw of keywords) {
      const idx = lower.indexOf(kw);
      if (idx > 0) { previewStart = Math.max(0, idx - 30); break; }
    }

    return { transaction, docType, textPreview: text.substring(previewStart, previewStart + 500) };
  } catch (err) {
    return { transaction: null, docType: 'unknown', textPreview: '', error: err instanceof Error ? err.message : 'Failed to parse PDF' };
  }
}

export async function parsePdfBatch(
  files: File[],
  onProgress?: (done: number, total: number) => void,
): Promise<{
  transactions: PdfTransaction[];
  failures: { name: string; reason: string; preview?: string }[];
}> {
  const transactions: PdfTransaction[] = [];
  const failures: { name: string; reason: string; preview?: string }[] = [];

  for (let i = 0; i < files.length; i++) {
    onProgress?.(i, files.length);
    const result = await parsePdf(files[i]);

    if (result.error) {
      failures.push({ name: files[i].name, reason: result.error });
      continue;
    }

    if (!result.transaction) {
      failures.push({
        name: files[i].name,
        reason: result.docType === 'unknown' ? 'unrecognized document type' : 'could not extract required fields',
        preview: result.textPreview?.substring(0, 200),
      });
      continue;
    }

    transactions.push(result.transaction);
  }

  onProgress?.(files.length, files.length);
  return { transactions, failures };
}

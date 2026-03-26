import { readXlsx } from '@/lib/xlsx-local';
import { parseDate as parseDateFmt, isValid } from '@/lib/date-utils';

export interface VestEvent {
  date: Date;
  quantity: number;
  symbol: string;
  grantNumber: number;
  type: 'RSU' | 'ESPP';
  /** ESPP purchase price per share (USD) — only for ESPP */
  purchasePrice?: number;
}

/** Convert a 2D string array (with header row) into an array of objects. */
function sheetToObjects(rows: string[][]): Record<string, string | number>[] {
  if (rows.length < 2) return [];
  const headers = rows[0];
  return rows.slice(1).map(row => {
    const obj: Record<string, string | number> = {};
    for (let i = 0; i < headers.length; i++) {
      const key = headers[i]?.trim();
      if (key) obj[key] = row[i] ?? '';
    }
    return obj;
  });
}

function parseFlexDate(value: string): Date | null {
  // Try MM/DD/YYYY (event rows)
  let d = parseDateFmt(value, 'MM/dd/yyyy');
  if (isValid(d)) return d;
  // Try DD-MMM-YYYY (grant/purchase rows)
  d = parseDateFmt(value, 'dd-MMM-yyyy');
  if (isValid(d)) return d;
  return null;
}

/**
 * Parse a BenefitHistory.xlsx file and extract all vest/purchase events.
 */
export async function parseBenefitHistory(buffer: ArrayBuffer): Promise<VestEvent[]> {
  const workbook = await readXlsx(buffer);
  const events: VestEvent[] = [];

  // ── Restricted Stock tab ──
  if (workbook.sheetNames.includes('Restricted Stock')) {
    const rawRows = workbook.sheets['Restricted Stock'];
    const rows = sheetToObjects(rawRows);

    // We need to carry the Grant Number and Symbol from the parent "Grant" row
    // into the child "Event" rows that follow it.
    let currentGrantNumber = 0;
    let currentSymbol = 'EQUITY';

    for (const row of rows) {
      const recordType = String(row['Record Type'] ?? '').trim();

      if (recordType === 'Grant') {
        currentGrantNumber = Number(row['Grant Number']) || 0;
        currentSymbol = String(row['Symbol'] ?? 'EQUITY').trim().toUpperCase();
        continue;
      }

      if (recordType === 'Event') {
        const eventType = String(row['Event Type'] ?? '').trim();
        if (eventType !== 'Shares vested') continue;

        const dateStr = String(row['Date'] ?? '');
        const date = parseFlexDate(dateStr);
        if (!date) continue;

        const quantity = Number(row['Qty. or Amount']) || 0;
        if (quantity <= 0) continue;

        events.push({
          date,
          quantity,
          symbol: currentSymbol,
          grantNumber: currentGrantNumber,
          type: 'RSU',
        });
      }
    }
  }

  // ── ESPP tab ──
  if (workbook.sheetNames.includes('ESPP')) {
    const rawRows = workbook.sheets['ESPP'];
    const rows = sheetToObjects(rawRows);

    for (const row of rows) {
      const recordType = String(row['Record Type'] ?? '').trim();
      if (recordType !== 'Purchase') continue;

      const dateStr = String(row['Purchase Date'] ?? '');
      const date = parseFlexDate(dateStr);
      if (!date) continue;

      const quantity = Number(row['Purchased Qty.']) || 0;
      if (quantity <= 0) continue;

      const symbol = String(row['Symbol'] ?? 'EQUITY').trim().toUpperCase();
      const purchasePrice = Number(row['Purchase Price']) || 0;

      events.push({
        date,
        quantity,
        symbol,
        grantNumber: 0,
        type: 'ESPP',
        purchasePrice: purchasePrice > 0 ? purchasePrice : undefined,
      });
    }
  }

  return events;
}

export async function parseBenefitHistoryFile(file: File): Promise<VestEvent[]> {
  const buffer = await file.arrayBuffer();
  return parseBenefitHistory(buffer);
}

import * as XLSX from 'xlsx';
import { parse, isValid } from 'date-fns';

export interface VestEvent {
  date: Date;
  quantity: number;
  symbol: string;
  grantNumber: number;
  type: 'RSU' | 'ESPP';
  /** ESPP purchase price per share (USD) — only for ESPP */
  purchasePrice?: number;
}

function parseFlexDate(value: string): Date | null {
  // Try MM/DD/YYYY (event rows)
  let d = parse(value, 'MM/dd/yyyy', new Date());
  if (isValid(d)) return d;
  // Try DD-MMM-YYYY (grant/purchase rows)
  d = parse(value, 'dd-MMM-yyyy', new Date());
  if (isValid(d)) return d;
  return null;
}

/**
 * Parse a BenefitHistory.xlsx file and extract all vest/purchase events.
 */
export function parseBenefitHistory(buffer: ArrayBuffer): VestEvent[] {
  const workbook = XLSX.read(buffer, { type: 'array' });
  const events: VestEvent[] = [];

  // ── Restricted Stock tab ──
  if (workbook.SheetNames.includes('Restricted Stock')) {
    const sheet = workbook.Sheets['Restricted Stock'];
    const rows = XLSX.utils.sheet_to_json<Record<string, string | number>>(sheet);

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
  if (workbook.SheetNames.includes('ESPP')) {
    const sheet = workbook.Sheets['ESPP'];
    const rows = XLSX.utils.sheet_to_json<Record<string, string | number>>(sheet);

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

export function parseBenefitHistoryFile(file: File): Promise<VestEvent[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const buffer = e.target?.result as ArrayBuffer;
        resolve(parseBenefitHistory(buffer));
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('Failed to read benefit history file'));
    reader.readAsArrayBuffer(file);
  });
}

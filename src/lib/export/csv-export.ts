import { AcbRecord, DispositionResult, Transaction } from '@/types';
import { formatDate as format } from '@/lib/date-utils';
import { writeXlsx, XlsxWriteSheet } from '@/lib/xlsx-local';

// ---------------------------------------------------------------------------
// Schedule 3 CSV (kept for backward compat)
// ---------------------------------------------------------------------------

export function generateSchedule3Csv(dispositions: DispositionResult[]): string {
  const headers = [
    'Description of Property',
    'Year of Acquisition',
    'Proceeds of Disposition',
    'Adjusted Cost Base',
    'Outlays and Expenses',
    'Gain (or Loss)',
    'Superficial Loss Denied',
  ];

  const rows = dispositions.map((d) => [
    `${d.transaction.symbol}  (${d.transaction.quantity} shares)`,
    d.yearOfAcquisition,
    d.proceeds.toFixed(2),
    d.acbOfSharesSold.toFixed(2),
    d.outlays.toFixed(2),
    d.allowedGainLoss.toFixed(2),
    d.isSuperficialLoss ? d.superficialLoss.toFixed(2) : '',
  ]);

  const csvRows = [headers, ...rows];
  return csvRows
    .map((row) =>
      row.map((cell) => {
        if (cell.includes(',') || cell.includes('"') || cell.includes('\n')) {
          return `"${cell.replace(/"/g, '""')}"`;
        }
        return cell;
      }).join(',')
    )
    .join('\n');
}

export function downloadCsv(dispositions: DispositionResult[], filename?: string): void {
  const csv = generateSchedule3Csv(dispositions);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename ?? `schedule3-${format(new Date(), 'yyyy-MM-dd')}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function round2(n: number): number { return Math.round(n * 100) / 100; }
function round4(n: number): number { return Math.round(n * 10000) / 10000; }
function round6(n: number): number { return Math.round(n * 1000000) / 1000000; }

const COL_WIDTH = 16;

function buildSchedule3Data(dispositions: DispositionResult[]): XlsxWriteSheet {
  const headers: (string | number)[] = [
    'Trade Date', 'Settlement Date', 'Symbol', 'Shares', 'Year Acquired',
    'Proceeds (CAD)', 'ACB (CAD)', 'Outlays (CAD)', 'Raw Gain/Loss',
    'Claimable Gain/Loss', 'SL Denied', 'Superficial?',
  ];
  const rows: (string | number | undefined)[][] = dispositions.map((d) => [
    d.transaction.tradeDate ? format(d.transaction.tradeDate, 'yyyy-MM-dd') : '',
    format(d.transaction.settlementDate, 'yyyy-MM-dd'),
    d.transaction.symbol, d.transaction.quantity, d.yearOfAcquisition,
    round2(d.proceeds), round2(d.acbOfSharesSold), round2(d.outlays),
    round2(d.rawGainLoss), round2(d.allowedGainLoss),
    d.isSuperficialLoss ? round2(d.superficialLoss) : '',
    d.isSuperficialLoss ? (Math.abs(d.superficialLoss - Math.abs(d.rawGainLoss)) < 0.01 ? 'Full' : 'Partial') : '',
  ]);
  rows.push([
    'TOTAL', '', '', '', '',
    round2(dispositions.reduce((s, d) => s + d.proceeds, 0)),
    round2(dispositions.reduce((s, d) => s + d.acbOfSharesSold, 0)),
    round2(dispositions.reduce((s, d) => s + d.outlays, 0)),
    round2(dispositions.reduce((s, d) => s + d.rawGainLoss, 0)),
    round2(dispositions.reduce((s, d) => s + d.allowedGainLoss, 0)),
    round2(dispositions.reduce((s, d) => s + d.superficialLoss, 0)),
    '',
  ]);
  return { data: [headers, ...rows], colWidths: Array(headers.length).fill(COL_WIDTH) };
}

function buildSecuritiesData(acbSnapshots: Map<string, AcbRecord>): XlsxWriteSheet {
  const headers: (string | number)[] = ['Symbol', 'Shares Held', 'Total ACB (CAD)', 'ACB/Share (CAD)'];
  const rows: (string | number)[][] = [];
  for (const sym of [...acbSnapshots.keys()].sort()) {
    const rec = acbSnapshots.get(sym)!;
    if (rec.totalShares > 0 || rec.totalAcb > 0) {
      rows.push([rec.symbol, round6(rec.totalShares), round2(rec.totalAcb), round2(rec.acbPerShare)]);
    }
  }
  if (rows.length === 0) rows.push(['(no holdings remaining)', '', '', '']);
  return { data: [headers, ...rows], colWidths: Array(headers.length).fill(COL_WIDTH) };
}

function buildTransactionsData(transactions: Transaction[]): XlsxWriteSheet {
  const headers: (string | number)[] = [
    'Settlement Date', 'Trade Date', 'Action', 'Symbol', 'Quantity',
    'Price/Share (orig)', 'Currency', 'FX Rate', 'Price/Share (CAD)',
    'Commission', 'Total (CAD)',
  ];
  const sorted = [...transactions].sort((a, b) => a.settlementDate.getTime() - b.settlementDate.getTime());
  const rows: (string | number)[][] = sorted.map((t) => [
    format(t.settlementDate, 'yyyy-MM-dd'),
    t.tradeDate ? format(t.tradeDate, 'yyyy-MM-dd') : format(t.settlementDate, 'yyyy-MM-dd'),
    t.action, t.symbol, round6(t.quantity), round6(t.pricePerShare),
    t.currency, round4(t.fxRate), round2(t.pricePerShareCAD),
    round2(t.commission), round2(t.totalCAD),
  ]);
  return { data: [headers, ...rows], colWidths: Array(headers.length).fill(COL_WIDTH) };
}

function downloadXlsxBlob(buf: ArrayBuffer, filename: string): void {
  const blob = new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Full Excel workbook: Schedule 3 + Securities + All Transactions
// ---------------------------------------------------------------------------

export function downloadFullExcel(
  dispositions: DispositionResult[],
  transactions: Transaction[],
  acbSnapshots: Map<string, AcbRecord>,
  taxYear: number,
): void {
  const buf = writeXlsx([
    { name: 'Schedule 3', sheet: buildSchedule3Data(dispositions) },
    { name: 'Securities', sheet: buildSecuritiesData(acbSnapshots) },
    { name: 'All Transactions', sheet: buildTransactionsData(transactions) },
  ]);
  downloadXlsxBlob(buf, `taxidermy-${taxYear}-${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
}

export function downloadAllYearsExcel(
  allDispositions: DispositionResult[],
  transactions: Transaction[],
  acbSnapshots: Map<string, AcbRecord>,
): void {
  const years = [...new Set(allDispositions.map(d => d.transaction.settlementDate.getFullYear()))].sort();

  const sheets: { name: string; sheet: XlsxWriteSheet }[] = [];
  for (const year of years) {
    const dispositions = allDispositions.filter(d => d.transaction.settlementDate.getFullYear() === year);
    sheets.push({ name: `Schedule 3 - ${year}`, sheet: buildSchedule3Data(dispositions) });
  }
  sheets.push({ name: 'Securities', sheet: buildSecuritiesData(acbSnapshots) });
  sheets.push({ name: 'All Transactions', sheet: buildTransactionsData(transactions) });

  const buf = writeXlsx(sheets);
  downloadXlsxBlob(buf, `taxidermy-all-years-${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
}

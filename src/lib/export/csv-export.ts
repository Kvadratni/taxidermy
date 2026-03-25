import { AcbRecord, DispositionResult, Transaction } from '@/types';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';

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
// Full Excel workbook: Schedule 3 + Securities + All Transactions
// ---------------------------------------------------------------------------

export function downloadFullExcel(
  dispositions: DispositionResult[],
  transactions: Transaction[],
  acbSnapshots: Map<string, AcbRecord>,
  taxYear: number,
): void {
  const wb = XLSX.utils.book_new();

  // --- Sheet 1: Schedule 3 ---
  const s3Headers = [
    'Trade Date',
    'Settlement Date',
    'Symbol',
    'Shares',
    'Year Acquired',
    'Proceeds (CAD)',
    'ACB (CAD)',
    'Outlays (CAD)',
    'Raw Gain/Loss',
    'Claimable Gain/Loss',
    'SL Denied',
    'Superficial?',
  ];
  const s3Rows = dispositions.map((d) => [
    d.transaction.tradeDate ? format(d.transaction.tradeDate, 'yyyy-MM-dd') : '',
    format(d.transaction.settlementDate, 'yyyy-MM-dd'),
    d.transaction.symbol,
    d.transaction.quantity,
    d.yearOfAcquisition,
    round2(d.proceeds),
    round2(d.acbOfSharesSold),
    round2(d.outlays),
    round2(d.rawGainLoss),
    round2(d.allowedGainLoss),
    d.isSuperficialLoss ? round2(d.superficialLoss) : '',
    d.isSuperficialLoss
      ? Math.abs(d.superficialLoss - Math.abs(d.rawGainLoss)) < 0.01
        ? 'Full'
        : 'Partial'
      : '',
  ]);

  // Totals row
  s3Rows.push([
    'TOTAL',
    '',
    '',
    '',
    round2(dispositions.reduce((s, d) => s + d.proceeds, 0)),
    round2(dispositions.reduce((s, d) => s + d.acbOfSharesSold, 0)),
    round2(dispositions.reduce((s, d) => s + d.outlays, 0)),
    round2(dispositions.reduce((s, d) => s + d.rawGainLoss, 0)),
    round2(dispositions.reduce((s, d) => s + d.allowedGainLoss, 0)),
    round2(dispositions.reduce((s, d) => s + d.superficialLoss, 0)),
    '',
  ]);

  const s3Sheet = XLSX.utils.aoa_to_sheet([s3Headers, ...s3Rows]);
  setColWidths(s3Sheet, s3Headers.length);
  XLSX.utils.book_append_sheet(wb, s3Sheet, 'Schedule 3');

  // --- Sheet 2: Securities (current holdings) ---
  const secHeaders = ['Symbol', 'Shares Held', 'Total ACB (CAD)', 'ACB/Share (CAD)'];
  const secRows: (string | number)[][] = [];
  const symbols = [...acbSnapshots.keys()].sort();
  for (const sym of symbols) {
    const rec = acbSnapshots.get(sym)!;
    if (rec.totalShares > 0 || rec.totalAcb > 0) {
      secRows.push([
        rec.symbol,
        round6(rec.totalShares),
        round2(rec.totalAcb),
        round2(rec.acbPerShare),
      ]);
    }
  }
  if (secRows.length === 0) {
    secRows.push(['(no holdings remaining)', '', '', '']);
  }

  const secSheet = XLSX.utils.aoa_to_sheet([secHeaders, ...secRows]);
  setColWidths(secSheet, secHeaders.length);
  XLSX.utils.book_append_sheet(wb, secSheet, 'Securities');

  // --- Sheet 3: All Transactions ---
  const txHeaders = [
    'Trade Date',
    'Settlement Date',
    'Action',
    'Symbol',
    'Quantity',
    'Price/Share (orig)',
    'Currency',
    'FX Rate',
    'Price/Share (CAD)',
    'Commission',
    'Total (CAD)',
  ];

  const sorted = [...transactions].sort(
    (a, b) => a.settlementDate.getTime() - b.settlementDate.getTime()
  );

  const txRows = sorted.map((t) => [
    t.tradeDate ? format(t.tradeDate, 'yyyy-MM-dd') : '',
    format(t.settlementDate, 'yyyy-MM-dd'),
    t.action,
    t.symbol,
    round6(t.quantity),
    round6(t.pricePerShare),
    t.currency,
    round4(t.fxRate),
    round2(t.pricePerShareCAD),
    round2(t.commission),
    round2(t.totalCAD),
  ]);

  const txSheet = XLSX.utils.aoa_to_sheet([txHeaders, ...txRows]);
  setColWidths(txSheet, txHeaders.length);
  XLSX.utils.book_append_sheet(wb, txSheet, 'All Transactions');

  // Download
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  const blob = new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `taxidermy-${taxYear}-${format(new Date(), 'yyyy-MM-dd')}.xlsx`;
  link.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function round6(n: number): number {
  return Math.round(n * 1000000) / 1000000;
}

function setColWidths(sheet: XLSX.WorkSheet, cols: number): void {
  sheet['!cols'] = Array.from({ length: cols }, () => ({ wch: 16 }));
}

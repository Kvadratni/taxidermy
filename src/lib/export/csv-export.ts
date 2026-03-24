import { DispositionResult } from '@/types';
import { format } from 'date-fns';

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

import { parseCsvText } from '@/lib/csv-parser';
import { RawImportData } from '@/types';

export function parseCsv(text: string): RawImportData {
  const rows = parseCsvText(text);

  if (rows.length < 2) {
    throw new Error('CSV must have at least a header row and one data row');
  }

  return {
    headers: rows[0],
    rows: rows.slice(1),
    source: 'csv',
  };
}

export async function parseCsvFile(file: File): Promise<RawImportData> {
  const text = await file.text();
  return parseCsv(text);
}

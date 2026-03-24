import Papa from 'papaparse';
import { RawImportData } from '@/types';

export function parseCsv(text: string): RawImportData {
  const result = Papa.parse(text, {
    skipEmptyLines: true,
  });

  const rows = result.data as string[][];
  if (rows.length < 2) {
    throw new Error('CSV must have at least a header row and one data row');
  }

  return {
    headers: rows[0],
    rows: rows.slice(1),
    source: 'csv',
  };
}

export function parseCsvFile(file: File): Promise<RawImportData> {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      skipEmptyLines: true,
      complete: (result) => {
        const rows = result.data as string[][];
        if (rows.length < 2) {
          reject(new Error('CSV must have at least a header row and one data row'));
          return;
        }
        resolve({
          headers: rows[0],
          rows: rows.slice(1),
          source: 'csv',
        });
      },
      error: (err) => reject(new Error(`CSV parsing failed: ${err.message}`)),
    });
  });
}

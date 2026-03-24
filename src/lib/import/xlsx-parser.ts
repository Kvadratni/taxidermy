import * as XLSX from 'xlsx';
import { RawImportData } from '@/types';

export function parseXlsx(buffer: ArrayBuffer): RawImportData {
  const workbook = XLSX.read(buffer, { type: 'array' });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json<string[]>(firstSheet, { header: 1 });

  const rows = data.filter((row) => row.length > 0).map((row) => row.map(String));

  if (rows.length < 2) {
    throw new Error('Spreadsheet must have at least a header row and one data row');
  }

  return {
    headers: rows[0],
    rows: rows.slice(1),
    source: 'xlsx',
  };
}

export function parseXlsxFile(file: File): Promise<RawImportData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const buffer = e.target?.result as ArrayBuffer;
        resolve(parseXlsx(buffer));
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
  });
}

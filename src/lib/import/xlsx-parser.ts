import { readXlsx } from '@/lib/xlsx-local';
import { RawImportData } from '@/types';

export async function parseXlsx(buffer: ArrayBuffer): Promise<RawImportData> {
  const workbook = await readXlsx(buffer);
  const firstSheetName = workbook.sheetNames[0];
  const data = workbook.sheets[firstSheetName] ?? [];

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

export async function parseXlsxFile(file: File): Promise<RawImportData> {
  const buffer = await file.arrayBuffer();
  return parseXlsx(buffer);
}

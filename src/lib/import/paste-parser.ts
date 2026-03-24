import { RawImportData } from '@/types';

export function parsePaste(text: string): RawImportData {
  const lines = text.trim().split('\n').filter((line) => line.trim().length > 0);

  if (lines.length < 2) {
    throw new Error('Pasted data must have at least a header row and one data row');
  }

  const rows = lines.map((line) => line.split('\t'));

  return {
    headers: rows[0],
    rows: rows.slice(1),
    source: 'paste',
  };
}

import { RawImportData } from '@/types';
import { parseCsv } from './csv-parser';

const SHEET_ID_REGEX = /\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/;

export function extractSheetId(url: string): string | null {
  const match = url.match(SHEET_ID_REGEX);
  return match ? match[1] : null;
}

export async function fetchGoogleSheet(url: string): Promise<RawImportData> {
  const sheetId = extractSheetId(url);
  if (!sheetId) {
    throw new Error(
      'Invalid Google Sheets URL. Expected a URL like: https://docs.google.com/spreadsheets/d/SHEET_ID/...'
    );
  }

  // Use the CSV export endpoint (works for public/shared sheets without API key)
  const exportUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=0`;

  const response = await fetch(exportUrl);
  if (!response.ok) {
    throw new Error(
      'Failed to fetch Google Sheet. Make sure the sheet is shared as "Anyone with the link can view".'
    );
  }

  const text = await response.text();
  const data = parseCsv(text);
  data.source = 'google-sheets';
  return data;
}

import { RawImportData } from '@/types';

/**
 * Detects and normalizes AdjustedCostBase.ca export files (CSV & XLSX).
 *
 * ACB.ca files have a preamble (title, URL, portfolio summary) before the
 * transaction header row. This normalizer:
 * 1. Detects ACB.ca by the preamble text
 * 2. Finds the transaction header row ("Security","Date","Transaction",...)
 * 3. Extracts trade/settlement dates from the Memo column
 * 4. Resolves foreign currency amounts when present
 * 5. Returns a standard RawImportData with flat columns the pipeline understands
 */

const ACB_HEADER_MARKER = 'Security';
const ACB_PREAMBLE = 'Adjusted Cost Base';

export function isAcbFormat(data: RawImportData): boolean {
  // Check first few rows for the preamble marker
  const firstHeader = data.headers[0]?.trim() ?? '';
  if (firstHeader.includes(ACB_PREAMBLE)) return true;

  // Also check the first data rows (XLSX may have it as a data row)
  for (let i = 0; i < Math.min(5, data.rows.length); i++) {
    if (data.rows[i]?.[0]?.includes(ACB_PREAMBLE)) return true;
  }
  return false;
}

function parseAcbDate(dateStr: string): string {
  // ACB.ca CSV: "2022-Apr-16" or "2022-Jul-07"
  // ACB.ca XLSX: Excel serial number (e.g. 44515) or already formatted string
  const trimmed = dateStr.trim();

  // Excel serial number (number-only string or actual number string)
  const serial = Number(trimmed);
  if (!isNaN(serial) && serial > 30000 && serial < 60000) {
    // Convert Excel serial to date
    const d = new Date((serial - 25569) * 86400000);
    return d.toISOString().slice(0, 10);
  }

  // "2022-Apr-16" format
  const months: Record<string, string> = {
    jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
    jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
  };
  const m = trimmed.match(/^(\d{4})-(\w{3})-(\d{1,2})$/);
  if (m) {
    const month = months[m[2].toLowerCase()];
    if (month) return `${m[1]}-${month}-${m[3].padStart(2, '0')}`;
  }

  // ISO or already formatted — pass through
  return trimmed;
}

function extractDatesFromMemo(memo: string): { tradeDate: string; settleDate: string } | null {
  // Memo format: "Trade 2022-04-18, settle 2022-04-20"
  const m = memo.match(/Trade\s+(\d{4}-\d{2}-\d{2}),\s*settle\s+(\d{4}-\d{2}-\d{2})/);
  if (m) return { tradeDate: m[1], settleDate: m[2] };
  return null;
}

export function normalizeAcbData(data: RawImportData): RawImportData {
  // Find the transaction header row
  let headerRowIdx = -1;
  const allRows = [data.headers, ...data.rows];

  for (let i = 0; i < allRows.length; i++) {
    if (allRows[i][0]?.trim() === ACB_HEADER_MARKER && allRows[i][2]?.trim() === 'Transaction') {
      headerRowIdx = i;
      break;
    }
  }

  if (headerRowIdx < 0) {
    throw new Error('Could not find ACB.ca transaction header row');
  }

  const acbHeaders = allRows[headerRowIdx];

  // Find column indices in the ACB.ca header
  const col = (name: string) => acbHeaders.findIndex(h => h.trim() === name);
  const iSecurity = col('Security');
  const iDate = col('Date');
  const iTxType = col('Transaction');
  const iAmount = col('Amount');
  const iShares = col('Shares');
  const iAmountPerShare = col('Amount/Share');
  const iCommission = col('Commission');
  const iMemo = col('Memo');
  const iForeignCurrency = col('Foreign Currency Transaction');
  const iFxRate = col('Exchange Rate');
  const iForeignAmount = col('Amount in Foreign Currency');

  // Build name→ticker lookup from portfolio summary
  // Summary: ["Name","Ticker","Shares","ACB","ACB/Share"] followed by data rows
  const nameToTicker: Record<string, string> = {};
  let defaultTicker = '';
  for (let i = 0; i < headerRowIdx; i++) {
    const row = allRows[i];
    if (row[0]?.trim() === 'Name' && row[1]?.trim() === 'Ticker') {
      // Read all summary rows until empty or next section
      for (let j = i + 1; j < headerRowIdx; j++) {
        const name = allRows[j]?.[0]?.trim();
        const ticker = allRows[j]?.[1]?.trim();
        if (!name || !ticker) break;
        nameToTicker[name] = ticker;
        if (!defaultTicker) defaultTicker = ticker;
      }
      break;
    }
  }

  // Build normalized rows
  const normalizedHeaders = [
    'Trade Date', 'Settlement Date', 'Action', 'Symbol',
    'Quantity', 'Price', 'Commission', 'Currency', 'Total Amount',
  ];

  const normalizedRows: string[][] = [];
  const txRows = allRows.slice(headerRowIdx + 1);

  for (const row of txRows) {
    const txType = row[iTxType]?.trim();
    if (!txType || (txType !== 'Buy' && txType !== 'Sell')) continue;

    const action = txType === 'Buy' ? 'BUY' : 'SELL';
    const shares = row[iShares]?.trim() || '0';

    // Get dates from memo (preferred) or fall back to the Date column
    const memo = iMemo >= 0 ? (row[iMemo] || '') : '';
    const memoDates = extractDatesFromMemo(memo);
    const fallbackDate = iDate >= 0 ? parseAcbDate(row[iDate] || '') : '';

    const tradeDate = memoDates?.tradeDate || fallbackDate;
    const settleDate = memoDates?.settleDate || fallbackDate;

    // Determine if foreign currency — use foreign amount and derive price
    const isForeign = iForeignCurrency >= 0 && row[iForeignCurrency]?.trim() === 'Yes';
    let pricePerShare: string;
    let currency: string;
    let totalAmount: string;

    if (isForeign && iForeignAmount >= 0 && row[iForeignAmount]) {
      // Foreign currency: use the USD amount, let Taxidermy do FX conversion
      const foreignTotal = parseFloat(row[iForeignAmount]) || 0;
      const qty = parseFloat(shares) || 1;
      pricePerShare = (foreignTotal / qty).toFixed(4);
      currency = 'USD';
      totalAmount = row[iForeignAmount].trim();
    } else {
      // CAD amount
      pricePerShare = iAmountPerShare >= 0 ? (row[iAmountPerShare]?.trim() || '0') : '0';
      currency = 'CAD';
      totalAmount = iAmount >= 0 ? (row[iAmount]?.trim() || '0') : '0';
    }

    const commission = iCommission >= 0 ? (row[iCommission]?.trim() || '0') : '0';

    // Get ticker from Security name → ticker lookup, or fall back to default
    const securityName = iSecurity >= 0 ? (row[iSecurity]?.trim() || '') : '';
    const symbol = nameToTicker[securityName] || defaultTicker;

    normalizedRows.push([
      tradeDate,
      settleDate,
      action,
      symbol,
      shares,
      pricePerShare,
      commission,
      currency,
      totalAmount,
    ]);
  }

  if (normalizedRows.length === 0) {
    throw new Error('No transactions found in ACB.ca file');
  }

  return {
    headers: normalizedHeaders,
    rows: normalizedRows,
    source: data.source,
  };
}

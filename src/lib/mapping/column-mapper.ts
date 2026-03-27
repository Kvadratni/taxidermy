import { parseISO, parseDate as parseDateFmt, isValid, addBusinessDays } from '@/lib/date-utils';
import { ColumnMapping, Transaction, TransactionAction, RawImportData } from '@/types';

function parseDate(value: string): Date | null {
  // Try ISO format first
  const iso = parseISO(value);
  if (isValid(iso)) return iso;

  // Try common formats
  const formats = [
    'yyyy-MM-dd',
    'MM/dd/yyyy',
    'dd/MM/yyyy',
    'M/d/yyyy',
    'yyyy/MM/dd',
    'MMM dd, yyyy',
    'MMMM dd, yyyy',
    'MMM dd yyyy',
    'MMMM dd yyyy',
    'dd-MMM-yyyy',
    'dd MMM yyyy',
    'MM-dd-yyyy',
  ];

  for (const fmt of formats) {
    const parsed = parseDateFmt(value, fmt);
    if (isValid(parsed)) return parsed;
  }

  return null;
}

function parseAction(value: string): TransactionAction | null {
  const normalized = value.trim().toLowerCase();
  if (['buy', 'purchase', 'bought'].includes(normalized)) return 'BUY';
  if (['sell', 'sale', 'sold'].includes(normalized)) return 'SELL';
  if (['split', 'stock split'].includes(normalized)) return 'SPLIT';
  if (['roc', 'return of capital'].includes(normalized)) return 'ROC';
  return null;
}

function parseNumber(value: string): number {
  // Remove currency symbols, commas, parentheses for negatives
  let cleaned = value.replace(/[$,]/g, '').trim();
  if (cleaned.startsWith('(') && cleaned.endsWith(')')) {
    cleaned = '-' + cleaned.slice(1, -1);
  }
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

export interface MappingError {
  row: number;
  field: string;
  value: string;
  message: string;
}

function mapGlToTransactions(
  data: RawImportData,
  mapping: ColumnMapping
): { transactions: Transaction[]; errors: MappingError[] } {
  const transactions: Transaction[] = [];
  const errors: MappingError[] = [];

  // Detect Record Type column for E*Trade G&L files (used to skip Summary rows)
  const recordTypeIdx = data.headers.findIndex(
    (h) => h.trim().toLowerCase() === 'record type'
  );

  for (let i = 0; i < data.rows.length; i++) {
    const row = data.rows[i];
    const rowNum = i + 2;

    // Skip Summary/header rows in E*Trade G&L files
    if (recordTypeIdx >= 0) {
      const recordType = (row[recordTypeIdx] ?? '').trim().toLowerCase();
      if (recordType !== 'sell' && recordType !== '') continue;
    }

    const dateSoldStr = (row[mapping.dateSold!] ?? '').trim();
    const qtyStr = (row[mapping.quantity!] ?? '').trim();

    // Skip empty rows or summary rows
    if (!dateSoldStr && !qtyStr) continue;

    const dateSold = parseDate(dateSoldStr);
    if (!dateSold) {
      if (dateSoldStr.toLowerCase() === 'summary' || dateSoldStr === '') continue; // Graceful skip for summary rows
      errors.push({ row: rowNum, field: 'dateSold', value: dateSoldStr, message: 'Invalid Date Sold' });
      continue;
    }

    let buyDate = dateSold;
    if (mapping.dateAcquired !== undefined) {
      const parsed = parseDate(row[mapping.dateAcquired] ?? '');
      if (parsed) buyDate = parsed;
    }

    const quantity = Math.abs(parseNumber(row[mapping.quantity] ?? '0'));
    if (quantity === 0) {
      errors.push({ row: rowNum, field: 'quantity', value: row[mapping.quantity] ?? '', message: 'Quantity must be non-zero' });
      continue;
    }

    const totalProceeds = Math.abs(parseNumber(row[mapping.totalProceeds!] ?? '0'));
    const acbTotal = Math.abs(parseNumber(row[mapping.acbTotal!] ?? '0'));
    const proceedsPerShare = quantity > 0 ? totalProceeds / quantity : 0;
    const acbPerShare = quantity > 0 ? acbTotal / quantity : 0;
    const currency = (mapping.glCurrency ?? 'CAD').toUpperCase();
    const finalSymbol = mapping.symbol !== undefined && mapping.symbol >= 0 ? (row[mapping.symbol] ?? 'EQUITY').trim() || 'EQUITY' : 'EQUITY';

    // Synthesize a BUY at the acquisition date so the engine builds ACB correctly
    if (mapping.dateAcquired !== undefined && mapping.dateAcquired >= 0) {
      const dateAcquiredStr = (row[mapping.dateAcquired] ?? '').trim();
      const buyDate = parseDate(dateAcquiredStr) || dateSold;

      transactions.push({
        id: crypto.randomUUID(),
        tradeDate: buyDate,
        settlementDate: addBusinessDays(buyDate, 1),
        action: 'BUY',
        symbol: finalSymbol,
        quantity,
        pricePerShare: acbPerShare,
        pricePerShareCAD: acbPerShare, // updated by FX conversion if non-CAD
        commission: 0,
        currency,
        fxRate: 1,
        totalCAD: acbTotal,
      });
    } else {
      // If no valid acquisition date is mapped, synthesize a BUY on the same date via an earlier transaction id
      const buyDate = dateSold;

      transactions.push({
        id: crypto.randomUUID(),
        tradeDate: buyDate,
        settlementDate: addBusinessDays(buyDate, 1),
        action: 'BUY',
        symbol: finalSymbol,
        quantity,
        pricePerShare: acbPerShare,
        pricePerShareCAD: acbPerShare, // updated by FX conversion if non-CAD
        commission: 0,
        currency,
        fxRate: 1,
        totalCAD: acbTotal,
      });
    }

    // Synthesize a SELL at the sale date
    transactions.push({
      id: crypto.randomUUID(),
      tradeDate: dateSold,
      settlementDate: addBusinessDays(dateSold, 1),
      action: 'SELL',
      symbol: finalSymbol,
      quantity,
      pricePerShare: proceedsPerShare,
      pricePerShareCAD: proceedsPerShare, // updated by FX conversion if non-CAD
      commission: 0,
      currency,
      fxRate: 1,
      totalCAD: totalProceeds,
      glOriginalAcb: acbTotal,
    });
  }

  return { transactions, errors };
}

/**
 * Map a BenefitHistory file's raw data into BUY transactions.
 * This looks for "Shares vested" and "Purchase" record types.
 */
function mapBenefitHistoryToTransactions(
  data: RawImportData,
  mapping: ColumnMapping,
): { transactions: Transaction[]; errors: MappingError[] } {
  const transactions: Transaction[] = [];
  const errors: MappingError[] = [];

  // Find key columns by header name (case-insensitive)
  const hdr = data.headers.map(h => h.trim().toLowerCase());
  const recTypeIdx = hdr.findIndex(h => h === 'record type');
  const eventTypeIdx = hdr.findIndex(h => h === 'event type');
  const dateIdx = hdr.findIndex(h => h === 'date');
  const qtyIdx = hdr.findIndex(h => h.includes('qty') || h.includes('amount'));
  const symbolIdx = hdr.findIndex(h => h === 'symbol');

  // ESPP-specific columns
  const purchaseDateIdx = hdr.findIndex(h => h === 'purchase date');
  const purchasePriceIdx = hdr.findIndex(h => h === 'purchase price');
  const purchasedQtyIdx = hdr.findIndex(h => h.includes('purchased qty'));

  // Track parent grant's symbol for child event rows
  let currentSymbol = 'EQUITY';

  for (let i = 0; i < data.rows.length; i++) {
    const row = data.rows[i];
    const rowNum = i + 2;
    const recordType = (recTypeIdx >= 0 ? row[recTypeIdx] ?? '' : '').trim();

    // Update current symbol from Grant rows
    if (recordType === 'Grant' && symbolIdx >= 0) {
      const sym = (row[symbolIdx] ?? '').trim().toUpperCase();
      if (sym) currentSymbol = sym;
    }

    let rowSymbol = currentSymbol;
    if (symbolIdx >= 0) {
      const sym = (row[symbolIdx] ?? '').trim().toUpperCase();
      if (sym) rowSymbol = sym;
    }

    // RSU vest events
    if (recordType === 'Event' && eventTypeIdx >= 0) {
      const eventType = (row[eventTypeIdx] ?? '').trim();
      if (eventType !== 'Shares vested') continue;

      const dateStr = dateIdx >= 0 ? (row[dateIdx] ?? '') : '';
      const date = parseDate(dateStr);
      if (!date) {
        errors.push({ row: rowNum, field: 'date', value: dateStr, message: 'Invalid date on vest event' });
        continue;
      }

      const quantity = qtyIdx >= 0 ? Math.abs(parseNumber(row[qtyIdx] ?? '0')) : 0;
      if (quantity <= 0) continue;

      const currency = (mapping.glCurrency ?? 'USD').toUpperCase();
      const finalSymbol = rowSymbol === 'EQUITY' ? 'EQUITY' : rowSymbol;

      transactions.push({
        id: crypto.randomUUID(),
        tradeDate: date,
        settlementDate: addBusinessDays(date, 1),
        action: 'BUY',
        symbol: finalSymbol,
        quantity,
        pricePerShare: 0,
        pricePerShareCAD: 0,
        commission: 0,
        currency,
        fxRate: 1,
        totalCAD: 0,
      });
    }

    // ESPP purchase rows
    if (recordType === 'Purchase' && purchaseDateIdx >= 0) {
      const dateStr = row[purchaseDateIdx] ?? '';
      const date = parseDate(dateStr);
      if (!date) {
        errors.push({ row: rowNum, field: 'purchaseDate', value: dateStr, message: 'Invalid ESPP purchase date' });
        continue;
      }

      const quantity = purchasedQtyIdx >= 0 ? Math.abs(parseNumber(row[purchasedQtyIdx] ?? '0')) : 0;
      if (quantity <= 0) continue;

      const price = purchasePriceIdx >= 0 ? Math.abs(parseNumber(row[purchasePriceIdx] ?? '0')) : 0;
      const currency = (mapping.glCurrency ?? 'USD').toUpperCase();
      const finalSymbol = rowSymbol === 'EQUITY' ? 'EQUITY' : rowSymbol;

      transactions.push({
        id: crypto.randomUUID(),
        tradeDate: date,
        settlementDate: addBusinessDays(date, 1),
        action: 'BUY',
        symbol: finalSymbol,
        quantity,
        pricePerShare: price,
        pricePerShareCAD: price,
        commission: 0,
        currency,
        fxRate: 1,
        totalCAD: quantity * price,
      });
    }
  }

  return { transactions, errors };
}

export function mapToTransactions(
  data: RawImportData,
  mapping: ColumnMapping
): { transactions: Transaction[]; errors: MappingError[] } {
  if (mapping.benefitHistoryMode) {
    return mapBenefitHistoryToTransactions(data, mapping);
  }

  if (mapping.glMode) {
    return mapGlToTransactions(data, mapping);
  }

  const transactions: Transaction[] = [];
  const errors: MappingError[] = [];

  for (let i = 0; i < data.rows.length; i++) {
    const row = data.rows[i];
    const rowNum = i + 2; // +2 for 1-indexed + header row

    // Parse dates: settlement date is primary, trade date is informational
    const dateStr = (row[mapping.date] ?? '').trim();
    const settlementDateStr = mapping.settlementDate !== undefined
      ? (row[mapping.settlementDate] ?? '').trim()
      : '';
    const qtyStr = mapping.quantity !== undefined ? (row[mapping.quantity] ?? '').trim() : '';

    // Skip completely empty rows
    if (!dateStr && !settlementDateStr && !qtyStr) continue;

    const date = parseDate(dateStr || settlementDateStr);
    if (!date) {
      if (!dateStr && !settlementDateStr) continue;
      errors.push({ row: rowNum, field: 'date', value: dateStr || settlementDateStr, message: 'Invalid date format' });
      continue;
    }

    // Parse action
    let action: TransactionAction | null = null;
    if (mapping.action !== undefined && mapping.action >= 0) {
      action = parseAction(row[mapping.action] ?? '');
    }

    // For IBKR: determine action from quantity sign
    const rawQty = parseNumber(row[mapping.quantity] ?? '0');
    if (!action && rawQty !== 0) {
      action = rawQty > 0 ? 'BUY' : 'SELL';
    }

    if (!action) {
      errors.push({
        row: rowNum,
        field: 'action',
        value: mapping.action !== undefined ? (row[mapping.action] ?? '') : '',
        message: 'Could not determine Buy/Sell action',
      });
      continue;
    }

    // Skip non-buy/sell for now (dividends, etc.)
    if (action !== 'BUY' && action !== 'SELL' && action !== 'SPLIT' && action !== 'ROC') {
      continue;
    }

    const symbol = (mapping.symbol !== undefined ? (row[mapping.symbol] ?? '') : '').trim().toUpperCase();
    if (!symbol) {
      errors.push({ row: rowNum, field: 'symbol', value: '', message: 'Missing symbol' });
      continue;
    }

    const quantity = Math.abs(rawQty);
    if (quantity === 0 && action !== 'ROC') {
      errors.push({ row: rowNum, field: 'quantity', value: row[mapping.quantity] ?? '', message: 'Quantity must be non-zero' });
      continue;
    }

    const price = mapping.price !== undefined ? Math.abs(parseNumber(row[mapping.price] ?? '0')) : 0;
    const commission = mapping.commission !== undefined
      ? Math.abs(parseNumber(row[mapping.commission] ?? '0'))
      : 0;

    const currency = mapping.currency !== undefined
      ? (row[mapping.currency] ?? 'CAD').trim().toUpperCase()
      : 'CAD';

    // Settlement date: use explicit column if present, otherwise T+1 from trade date
    let settlementDate: Date;
    if (mapping.settlementDate !== undefined && row[mapping.settlementDate]) {
      const parsed = parseDate(row[mapping.settlementDate]);
      settlementDate = parsed ?? addBusinessDays(date, 1);
    } else {
      settlementDate = addBusinessDays(date, 1);
    }

    transactions.push({
      id: crypto.randomUUID(),
      tradeDate: date,
      settlementDate,
      action,
      symbol,
      quantity,
      pricePerShare: price,
      pricePerShareCAD: price, // Will be updated by FX conversion
      commission,
      currency,
      fxRate: 1,
      totalCAD: quantity * price + (action === 'BUY' ? commission : -commission),
    });
  }

  return { transactions, errors };
}


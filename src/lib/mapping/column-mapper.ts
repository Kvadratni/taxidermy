import { v4 as uuidv4 } from 'uuid';
import { parseISO, parse, isValid, addBusinessDays } from 'date-fns';
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
    'dd-MMM-yyyy',
  ];

  for (const fmt of formats) {
    const parsed = parse(value, fmt, new Date());
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

  for (let i = 0; i < data.rows.length; i++) {
    const row = data.rows[i];
    const rowNum = i + 2;

    const dateSoldStr = row[mapping.dateSold!] ?? '';
    const dateSold = parseDate(dateSoldStr);
    if (!dateSold) {
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
    const proceedsPerShare = totalProceeds / quantity;
    const acbPerShare = acbTotal / quantity;

    // Synthesize a BUY at the acquisition date so the engine builds ACB correctly
    transactions.push({
      id: uuidv4(),
      date: buyDate,
      settlementDate: addBusinessDays(buyDate, 1),
      action: 'BUY',
      symbol: 'EQUITY',
      quantity,
      pricePerShare: acbPerShare,
      pricePerShareCAD: acbPerShare,
      commission: 0,
      currency: 'CAD',
      fxRate: 1,
      totalCAD: acbTotal,
    });

    // Synthesize a SELL at the sale date
    transactions.push({
      id: uuidv4(),
      date: dateSold,
      settlementDate: addBusinessDays(dateSold, 1),
      action: 'SELL',
      symbol: 'EQUITY',
      quantity,
      pricePerShare: proceedsPerShare,
      pricePerShareCAD: proceedsPerShare,
      commission: 0,
      currency: 'CAD',
      fxRate: 1,
      totalCAD: totalProceeds,
    });
  }

  return { transactions, errors };
}

export function mapToTransactions(
  data: RawImportData,
  mapping: ColumnMapping
): { transactions: Transaction[]; errors: MappingError[] } {
  if (mapping.glMode) {
    return mapGlToTransactions(data, mapping);
  }

  const transactions: Transaction[] = [];
  const errors: MappingError[] = [];

  for (let i = 0; i < data.rows.length; i++) {
    const row = data.rows[i];
    const rowNum = i + 2; // +2 for 1-indexed + header row

    // Parse date
    const dateStr = row[mapping.date] ?? '';
    const date = parseDate(dateStr);
    if (!date) {
      errors.push({ row: rowNum, field: 'date', value: dateStr, message: 'Invalid date format' });
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

    // Settlement date: use explicit column, or T+1 from trade date
    let settlementDate: Date;
    if (mapping.settlementDate !== undefined && row[mapping.settlementDate]) {
      const parsed = parseDate(row[mapping.settlementDate]);
      settlementDate = parsed ?? addBusinessDays(date, 1);
    } else {
      settlementDate = addBusinessDays(date, 1);
    }

    transactions.push({
      id: uuidv4(),
      date,
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

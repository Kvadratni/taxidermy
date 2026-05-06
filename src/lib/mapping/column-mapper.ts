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
  if (['buy_total', 'buy total'].includes(normalized)) return 'BUY_TOTAL';
  if (['sell', 'sale', 'sold'].includes(normalized)) return 'SELL';
  if (['sell_total', 'sell total'].includes(normalized)) return 'SELL_TOTAL';
  if (['split', 'stock split'].includes(normalized)) return 'SPLIT';
  if (['roc', 'return of capital'].includes(normalized)) return 'ROC';
  if (['roc_total', 'roc total'].includes(normalized)) return 'ROC_TOTAL';
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

  const currency = (mapping.glCurrency ?? 'CAD').toUpperCase();

  // ── Pass 1: collect all valid rows ────────────────────────────────────────
  interface GlRow {
    symbol: string;
    buyDate: Date;
    dateSold: Date;
    quantity: number;
    acbTotal: number;
    acbPerShare: number;
    totalProceeds: number;
    proceedsPerShare: number;
  }
  const rows: GlRow[] = [];

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
      if (dateSoldStr.toLowerCase() === 'summary' || dateSoldStr === '') continue;
      errors.push({ row: rowNum, field: 'dateSold', value: dateSoldStr, message: 'Invalid Date Sold' });
      continue;
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
    const finalSymbol = mapping.symbol !== undefined && mapping.symbol >= 0 ? (row[mapping.symbol] ?? 'EQUITY').trim() || 'EQUITY' : 'EQUITY';

    let buyDate: Date;
    if (mapping.dateAcquired !== undefined && mapping.dateAcquired >= 0) {
      const dateAcquiredStr = (row[mapping.dateAcquired] ?? '').trim();
      buyDate = parseDate(dateAcquiredStr) || dateSold;
    } else {
      buyDate = dateSold;
    }

    rows.push({ symbol: finalSymbol, buyDate, dateSold, quantity, acbTotal, acbPerShare, totalProceeds, proceedsPerShare });
  }

  // ── Pass 2: aggregate BUYs by (symbol, acquisitionDate) ───────────────────
  // Multiple G&L rows can reference the same acquisition event (e.g. an RSU
  // vest of 165 shares sold across 2 lots). We aggregate into a single BUY
  // so the engine gets the real acquisition history, not per-lot fragments.
  const buyMap = new Map<string, { symbol: string; date: Date; totalQty: number; totalCost: number }>();

  for (const r of rows) {
    const key = `${r.symbol}|${r.buyDate.getTime()}`;
    const existing = buyMap.get(key);
    if (existing) {
      existing.totalQty += r.quantity;
      existing.totalCost += r.acbTotal;
    } else {
      buyMap.set(key, { symbol: r.symbol, date: r.buyDate, totalQty: r.quantity, totalCost: r.acbTotal });
    }
  }

  // Emit aggregated BUY transactions
  for (const buy of buyMap.values()) {
    const pricePerShare = buy.totalQty > 0 ? buy.totalCost / buy.totalQty : 0;
    transactions.push({
      id: crypto.randomUUID(),
      tradeDate: buy.date,
      settlementDate: addBusinessDays(buy.date, 1),
      action: 'BUY',
      symbol: buy.symbol,
      quantity: buy.totalQty,
      pricePerShare,
      pricePerShareCAD: pricePerShare,
      commission: 0,
      currency,
      fxRate: 1,
      totalCAD: buy.totalCost,
    });
  }

  // ── Pass 3: emit SELL transactions (one per G&L row) ──────────────────────
  for (const r of rows) {
    transactions.push({
      id: crypto.randomUUID(),
      tradeDate: r.dateSold,
      settlementDate: addBusinessDays(r.dateSold, 1),
      action: 'SELL',
      symbol: r.symbol,
      quantity: r.quantity,
      pricePerShare: r.proceedsPerShare,
      pricePerShareCAD: r.proceedsPerShare,
      commission: 0,
      currency,
      fxRate: 1,
      totalCAD: r.totalProceeds,
      glOriginalAcb: r.acbTotal,
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

    const isTotalAction = action === 'BUY_TOTAL' || action === 'SELL_TOTAL' || action === 'ROC_TOTAL';
    const effectivePrice = isTotalAction ? (quantity > 0 ? price / quantity : price) : price;

    let totalCAD: number;
    if (action === 'BUY_TOTAL') {
      totalCAD = price + commission;
    } else if (action === 'SELL_TOTAL') {
      totalCAD = price - commission;
    } else if (action === 'ROC_TOTAL') {
      totalCAD = -price;
    } else {
      totalCAD = quantity * price + (action === 'BUY' ? commission : -commission);
    }

    transactions.push({
      id: crypto.randomUUID(),
      tradeDate: date,
      settlementDate,
      action,
      symbol,
      quantity,
      pricePerShare: effectivePrice,
      pricePerShareCAD: effectivePrice, // Will be updated by FX conversion
      commission,
      currency,
      fxRate: 1,
      totalCAD,
    });
  }

  return { transactions, errors };
}


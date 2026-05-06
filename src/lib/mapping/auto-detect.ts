import { ColumnMapping } from '@/types';
import { BROKERAGE_FORMATS } from '@/lib/constants/brokerage-formats';

export interface DetectionResult {
  format: string;
  confidence: number;
  mapping: ColumnMapping;
}

function headerIndex(headers: string[], target: string): number {
  return headers.findIndex(
    (h) => h.trim().toLowerCase() === target.toLowerCase()
  );
}

export function detectFormat(headers: string[]): DetectionResult | null {
  let best: DetectionResult | null = null;

  for (const fmt of BROKERAGE_FORMATS) {
    let matched = 0;
    for (const sig of fmt.headerSignature) {
      if (headers.some((h) => h.trim().toLowerCase().includes(sig.toLowerCase()))) {
        matched++;
      }
    }

    const confidence = matched / fmt.headerSignature.length;
    if (confidence > 0.6 && (!best || confidence > best.confidence)) {
      // Build actual mapping from detected headers
      const mapping = buildMappingForFormat(fmt.name, headers);
      if (mapping) {
        best = { format: fmt.name, confidence, mapping };
      }
    }
  }

  return best;
}

function buildMappingForFormat(
  formatName: string,
  headers: string[]
): ColumnMapping | null {
  switch (formatName) {
    case 'AdjustedCostBase.ca': {
      const date = headerIndex(headers, 'Trade Date');
      const settlement = headerIndex(headers, 'Settlement Date');
      const action = headerIndex(headers, 'Action');
      const symbol = headerIndex(headers, 'Symbol');
      const quantity = headerIndex(headers, 'Quantity');
      const price = headerIndex(headers, 'Price');
      const commission = headerIndex(headers, 'Commission');
      const currency = headerIndex(headers, 'Currency');

      if (date < 0 || action < 0 || symbol < 0 || quantity < 0) return null;

      return {
        date,
        action,
        symbol,
        quantity,
        price: price >= 0 ? price : undefined,
        commission: commission >= 0 ? commission : undefined,
        currency: currency >= 0 ? currency : undefined,
        settlementDate: settlement >= 0 ? settlement : undefined,
      };
    }

    case 'G&L Report': {
      const dateSold = headerIndex(headers, 'Date Sold');
      const totalProceeds = headerIndex(headers, 'Total Proceeds');
      const acbTotal = headerIndex(headers, 'Adjusted Cost Basis');
      const quantity = headerIndex(headers, 'Quantity');
      const dateAcquired = headerIndex(headers, 'Date Acquired');
      const symbol = headerIndex(headers, 'Symbol');

      if (dateSold < 0 || totalProceeds < 0 || acbTotal < 0 || quantity < 0) return null;

      return {
        date: dateSold,
        quantity,
        glMode: true,
        dateSold,
        dateAcquired: dateAcquired >= 0 ? dateAcquired : undefined,
        totalProceeds,
        acbTotal,
        symbol: symbol >= 0 ? symbol : undefined,
      };
    }

    case 'Questrade': {
      const date = headerIndex(headers, 'Transaction Date');
      const settlement = headerIndex(headers, 'Settlement Date');
      const action = headerIndex(headers, 'Action');
      const symbol = headerIndex(headers, 'Symbol');
      const quantity = headerIndex(headers, 'Quantity');
      const netAmount = headerIndex(headers, 'Net Amount');
      const currency = headerIndex(headers, 'Currency');

      if (date < 0 || action < 0 || symbol < 0 || quantity < 0 || netAmount < 0) return null;

      return {
        date,
        action,
        symbol,
        quantity,
        price: netAmount,
        currency: currency >= 0 ? currency : undefined,
        settlementDate: settlement >= 0 ? settlement : undefined,
        forceTotal: true,
      };
    }

    case 'Wealthsimple': {
      const date = headerIndex(headers, 'Date');
      const action = headerIndex(headers, 'Type');
      const symbol = headerIndex(headers, 'Symbol');
      const quantity = headerIndex(headers, 'Quantity');
      const price = headerIndex(headers, 'Price');
      const currency = headerIndex(headers, 'Currency');

      if (date < 0 || action < 0 || quantity < 0 || price < 0) return null;

      return {
        date,
        action,
        symbol: symbol >= 0 ? symbol : headerIndex(headers, 'Description'),
        quantity,
        price,
        currency: currency >= 0 ? currency : undefined,
      };
    }

    case 'Interactive Brokers': {
      const symbol = headerIndex(headers, 'Symbol');
      const date = headerIndex(headers, 'Date/Time');
      const quantity = headerIndex(headers, 'Quantity');
      const price = headerIndex(headers, 'T. Price');
      const commission = headerIndex(headers, 'Comm/Fee');
      const currency = headerIndex(headers, 'Currency');

      if (symbol < 0 || date < 0 || quantity < 0 || price < 0) return null;

      return {
        date,
        action: -1, // IBKR uses positive/negative quantity for buy/sell
        symbol,
        quantity,
        price,
        commission: commission >= 0 ? commission : undefined,
        currency: currency >= 0 ? currency : undefined,
      };
    }

    case 'E*Trade Benefit History': {
      // This is a special multi-row format with Record Type + Event Type columns or ESPP columns
      const recType = headerIndex(headers, 'Record Type');
      const qty1 = headerIndex(headers, 'Qty. or Amount');
      const qty2 = headerIndex(headers, 'Purchased Qty.');
      
      const hasQty = qty1 >= 0 || qty2 >= 0;

      if (recType < 0 || !hasQty) return null;

      return {
        date: headerIndex(headers, 'Date'),
        quantity: qty1 >= 0 ? qty1 : qty2,
        benefitHistoryMode: true,
        glCurrency: 'USD',
      };
    }

    default:
      return null;
  }
}

export function suggestMapping(headers: string[]): Partial<ColumnMapping> {
  const mapping: Partial<ColumnMapping> = {};
  const lowerHeaders = headers.map((h) => h.trim().toLowerCase());

  for (let i = 0; i < lowerHeaders.length; i++) {
    const h = lowerHeaders[i];

    // Settlement date detection — must check before generic date
    if (mapping.settlementDate === undefined && (h.includes('settlement') && h.includes('date'))) {
      mapping.settlementDate = i;
      continue; // Don't also match as trade date
    }

    // Trade date / generic date — skip if already matched as settlement
    if (!mapping.date && (h.includes('date') || h.includes('time'))) {
      mapping.date = i;
    }
    if (!mapping.action && (h.includes('action') || h.includes('type') || h.includes('side'))) {
      mapping.action = i;
    }
    if (!mapping.symbol && (h.includes('symbol') || h.includes('ticker') || h.includes('security'))) {
      mapping.symbol = i;
    }
    if (!mapping.quantity && (h.includes('quantity') || h.includes('qty') || h.includes('shares'))) {
      mapping.quantity = i;
    }
    if (!mapping.price && (h.includes('price') || h.includes('cost'))) {
      mapping.price = i;
    }
    if (mapping.commission === undefined && (h.includes('commission') || h.includes('fee') || h.includes('comm'))) {
      mapping.commission = i;
    }
    if (mapping.currency === undefined && (h.includes('currency') || h.includes('curr'))) {
      mapping.currency = i;
    }
  }

  return mapping;
}

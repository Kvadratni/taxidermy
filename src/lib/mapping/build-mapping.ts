import { ColumnMapping } from '@/types';

export interface BuildColumnMappingOptions {
  isGl: boolean;
  currency: string;
  detectedFormat?: string | null;
  existingMapping?: ColumnMapping | null;
}

export function shouldForceTotalMapping({
  detectedFormat,
  existingMapping,
}: Pick<BuildColumnMappingOptions, 'detectedFormat' | 'existingMapping'>): boolean {
  return detectedFormat === 'Questrade' || existingMapping?.forceTotal === true;
}

export function buildColumnMapping(
  assignments: Record<number, string>,
  {
    isGl,
    currency,
    detectedFormat,
    existingMapping,
  }: BuildColumnMappingOptions
): ColumnMapping | null {
  const reverse: Record<string, number> = {};
  for (const [colIdx, field] of Object.entries(assignments)) {
    if (field) reverse[field] = parseInt(colIdx, 10);
  }

  if (isGl) {
    if (
      reverse.dateSold === undefined ||
      reverse.totalProceeds === undefined ||
      reverse.acbTotal === undefined ||
      reverse.quantity === undefined
    ) {
      return null;
    }

    return {
      date: reverse.dateSold,
      quantity: reverse.quantity,
      glMode: true,
      glCurrency: currency,
      dateSold: reverse.dateSold,
      dateAcquired: reverse.dateAcquired,
      totalProceeds: reverse.totalProceeds,
      acbTotal: reverse.acbTotal,
      symbol: reverse.symbol,
    };
  }

  if (reverse.date === undefined && reverse.settlementDate === undefined) return null;
  if (reverse.quantity === undefined) return null;

  const hasSettlement = reverse.settlementDate !== undefined;
  const hasTradeDate = reverse.date !== undefined;
  const forceTotal = shouldForceTotalMapping({ detectedFormat, existingMapping });

  return {
    date: hasTradeDate ? reverse.date! : reverse.settlementDate!,
    quantity: reverse.quantity,
    action: reverse.action,
    symbol: reverse.symbol,
    price: reverse.price,
    commission: reverse.commission,
    currency: reverse.currency,
    settlementDate: hasSettlement ? reverse.settlementDate : undefined,
    forceTotal: forceTotal || undefined,
  };
}

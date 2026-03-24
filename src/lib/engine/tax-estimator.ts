import { TaxBracket, TaxEstimate } from '@/types';
import {
  FEDERAL_BRACKETS,
  PROVINCIAL_BRACKETS,
  CAPITAL_GAINS_INCLUSION_RATE,
} from '@/lib/constants/tax-brackets';

function calculateTaxInBrackets(
  income: number,
  brackets: TaxBracket[],
  otherIncome: number = 0
): { tax: number; breakdown: { bracket: TaxBracket; taxableInBracket: number; taxAtBracket: number }[] } {
  let remaining = income;
  let tax = 0;
  const breakdown: { bracket: TaxBracket; taxableInBracket: number; taxAtBracket: number }[] = [];

  for (const bracket of brackets) {
    if (remaining <= 0) break;

    const bracketMax = bracket.max ?? Infinity;
    const bracketStart = Math.max(bracket.min, otherIncome);
    if (bracketStart >= bracketMax) continue;

    const bracketRoom = bracketMax - bracketStart;
    if (bracketRoom <= 0) continue;

    const taxableInBracket = Math.min(remaining, bracketRoom);
    const taxAtBracket = taxableInBracket * bracket.rate;

    tax += taxAtBracket;
    remaining -= taxableInBracket;

    breakdown.push({ bracket, taxableInBracket, taxAtBracket });
  }

  return { tax, breakdown };
}

export function estimateTax(
  totalCapitalGains: number,
  province: string,
  otherIncome: number = 0
): TaxEstimate {
  const inclusionRate = CAPITAL_GAINS_INCLUSION_RATE;
  const taxableCapitalGains = totalCapitalGains * inclusionRate;

  if (taxableCapitalGains <= 0) {
    return {
      province,
      totalCapitalGains,
      inclusionRate,
      taxableCapitalGains: 0,
      federalTax: 0,
      provincialTax: 0,
      combinedTax: 0,
      effectiveRate: 0,
      bracketBreakdown: [],
    };
  }

  const federal = calculateTaxInBrackets(taxableCapitalGains, FEDERAL_BRACKETS, otherIncome);

  const provBrackets = PROVINCIAL_BRACKETS[province];
  const provincial = provBrackets
    ? calculateTaxInBrackets(taxableCapitalGains, provBrackets, otherIncome)
    : { tax: 0, breakdown: [] };

  const combinedTax = federal.tax + provincial.tax;
  const effectiveRate = totalCapitalGains > 0 ? combinedTax / totalCapitalGains : 0;

  return {
    province,
    totalCapitalGains,
    inclusionRate,
    taxableCapitalGains,
    federalTax: federal.tax,
    provincialTax: provincial.tax,
    combinedTax,
    effectiveRate,
    bracketBreakdown: [
      ...federal.breakdown.map((b) => ({ ...b, level: 'federal' as const })),
      ...provincial.breakdown.map((b) => ({ ...b, level: 'provincial' as const })),
    ],
  };
}

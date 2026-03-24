import { Transaction, DispositionResult, SuperficialLossDetail, AcbRecord } from '@/types';
import { calculateDispositions, AcbState } from './acb';
import { detectSuperficialLosses } from './superficial-loss';

export interface CalculationResult {
  dispositions: DispositionResult[];
  superficialLosses: SuperficialLossDetail[];
  acbSnapshots: Map<string, AcbRecord>;
  totalGains: number;
  totalLosses: number;
  netGainLoss: number;
}

export function calculateGains(transactions: Transaction[]): CalculationResult {
  // Pass 1: Calculate raw dispositions and ACB
  const { dispositions, acbState } = calculateDispositions(transactions);

  // Pass 2: Detect and apply superficial losses
  const superficialLosses = detectSuperficialLosses(
    transactions,
    dispositions,
    acbState
  );

  // Compute totals from adjusted results
  let totalGains = 0;
  let totalLosses = 0;

  for (const d of dispositions) {
    if (d.allowedGainLoss >= 0) {
      totalGains += d.allowedGainLoss;
    } else {
      totalLosses += d.allowedGainLoss;
    }
  }

  // Snapshot final ACB state
  const acbSnapshots = new Map<string, AcbRecord>();
  for (const [symbol, record] of acbState.records) {
    acbSnapshots.set(symbol, { ...record });
  }

  return {
    dispositions,
    superficialLosses,
    acbSnapshots,
    totalGains,
    totalLosses,
    netGainLoss: totalGains + totalLosses,
  };
}

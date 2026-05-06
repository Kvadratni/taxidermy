import { Transaction, DispositionResult, SuperficialLossDetail, AcbRecord } from '@/types';
import {
  createAcbState,
  processBuy,
  processSell,
  processSplit,
  processRoc,
  processRocTotal,
  AcbState,
} from './acb';
import { checkSuperficialLoss } from './superficial-loss';

export interface CalculationResult {
  dispositions: DispositionResult[];
  superficialLosses: SuperficialLossDetail[];
  acbSnapshots: Map<string, AcbRecord>;
  totalGains: number;
  totalLosses: number;
  netGainLoss: number;
}

export function calculateGains(transactions: Transaction[]): CalculationResult {
  const sorted = [...transactions].sort(
    (a, b) => a.settlementDate.getTime() - b.settlementDate.getTime()
  );

  const state = createAcbState();
  const dispositions: DispositionResult[] = [];
  const superficialLosses: SuperficialLossDetail[] = [];

  for (const txn of sorted) {
    switch (txn.action) {
      case 'BUY':
      case 'BUY_TOTAL':
        processBuy(state, txn);
        break;
      case 'SELL':
      case 'SELL_TOTAL': {
        const result = processSell(state, txn);
        
        // Inline superficial loss detection and adjustment
        if (result.rawGainLoss < 0) {
          const slDetail = checkSuperficialLoss(result, state, sorted);
          if (slDetail) {
            superficialLosses.push(slDetail);
          }
        }
        
        dispositions.push(result);
        break;
      }
      case 'SPLIT':
        processSplit(state, txn);
        break;
      case 'ROC':
        processRoc(state, txn);
        break;
      case 'ROC_TOTAL':
        processRocTotal(state, txn);
        break;
    }
  }

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
  for (const [symbol, record] of state.records) {
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

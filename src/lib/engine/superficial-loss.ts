import { addDays, isWithinInterval } from 'date-fns';
import {
  Transaction,
  DispositionResult,
  SuperficialLossDetail,
} from '@/types';
import { AcbState, addToAcb, getAcbRecord } from './acb';

/**
 * CRA Superficial Loss Formula:
 * SL = (min(S, P, B) / S) * L
 *
 * S = shares sold in the disposition
 * P = shares purchased in the 61-day window (30 before, day of, 30 after)
 * B = shares of the same security held at end of window (settlementDate + 30)
 * L = absolute value of the loss
 */
export function detectSuperficialLosses(
  transactions: Transaction[],
  dispositions: DispositionResult[],
  acbState: AcbState
): SuperficialLossDetail[] {
  const sorted = [...transactions].sort(
    (a, b) => a.settlementDate.getTime() - b.settlementDate.getTime()
  );

  const details: SuperficialLossDetail[] = [];

  for (const disp of dispositions) {
    // Only check sells that resulted in a loss
    if (disp.rawGainLoss >= 0) continue;

    const sellDate = disp.transaction.settlementDate;
    const windowStart = addDays(sellDate, -30);
    const windowEnd = addDays(sellDate, 30);

    const S = disp.transaction.quantity;
    const L = Math.abs(disp.rawGainLoss);

    // P: shares purchased in the 61-day window (same symbol, excluding the sell itself)
    let P = 0;
    for (const txn of sorted) {
      if (txn.symbol !== disp.transaction.symbol) continue;
      if (txn.action !== 'BUY') continue;
      if (txn.id === disp.transaction.id) continue;
      if (
        isWithinInterval(txn.settlementDate, {
          start: windowStart,
          end: windowEnd,
        })
      ) {
        P += txn.quantity;
      }
    }

    if (P === 0) continue; // No repurchase in window, loss is allowed

    // B: shares held 30 days after the sale
    const checkDate = addDays(sellDate, 30);
    const B = computeSharesHeldAt(sorted, disp.transaction.symbol, checkDate);

    if (B === 0) continue; // Not holding at end of window, loss is allowed

    const minSPB = Math.min(S, P, B);
    const deniedLoss = (minSPB / S) * L;

    if (deniedLoss > 0) {
      // Update the disposition
      disp.superficialLoss = deniedLoss;
      disp.allowedGainLoss = disp.rawGainLoss + deniedLoss; // makes loss less negative
      disp.isSuperficialLoss = true;

      // Add denied loss to ACB of remaining shares
      addToAcb(acbState, disp.transaction.symbol, deniedLoss);

      details.push({
        dispositionId: disp.transaction.id,
        sharesSold: S,
        sharesPurchasedInWindow: P,
        sharesHeldAfter: B,
        totalLoss: L,
        deniedLoss,
      });
    }
  }

  return details;
}

function computeSharesHeldAt(
  sortedTransactions: Transaction[],
  symbol: string,
  asOfDate: Date
): number {
  let shares = 0;
  for (const txn of sortedTransactions) {
    if (txn.symbol !== symbol) continue;
    if (txn.settlementDate > asOfDate) break;
    switch (txn.action) {
      case 'BUY':
        shares += txn.quantity;
        break;
      case 'SELL':
        shares -= txn.quantity;
        break;
      case 'SPLIT':
        shares *= txn.splitRatio ?? 2;
        break;
    }
  }
  return Math.max(0, shares);
}

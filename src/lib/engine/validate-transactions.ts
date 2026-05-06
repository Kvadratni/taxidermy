import { Transaction, ValidationIssue } from '@/types';
import { formatDate as format } from '@/lib/date-utils';

/**
 * Validate a merged set of transactions for common issues.
 */
export function validateTransactions(transactions: Transaction[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  const sorted = [...transactions].sort(
    (a, b) => a.settlementDate.getTime() - b.settlementDate.getTime()
  );

  // 1. Share balance check — ensure no symbol goes negative
  const balances = new Map<string, number>();
  for (const txn of sorted) {
    const current = balances.get(txn.symbol) || 0;
    let next: number;

    if (txn.action === 'BUY' || txn.action === 'BUY_TOTAL') {
      next = current + txn.quantity;
    } else if (txn.action === 'SELL' || txn.action === 'SELL_TOTAL') {
      next = current - txn.quantity;
    } else {
      next = current; // SPLIT/ROC don't change share count for this check
    }

    if (next < -0.001) { // small tolerance for floating point
      issues.push({
        type: 'error',
        symbol: txn.symbol,
        date: txn.settlementDate,
        message: `Share balance for ${txn.symbol} goes negative (${next.toFixed(3)}) on ${format(txn.settlementDate, 'yyyy-MM-dd')}. You may be missing an acquisition file.`,
      });
    }

    balances.set(txn.symbol, next);
  }

  // 2. Duplicate detection — same date + same quantity + same symbol + same action across files
  const seen = new Map<string, Transaction>();
  for (const txn of sorted) {
    const key = `${txn.symbol}|${format(txn.settlementDate, 'yyyy-MM-dd')}|${txn.action}|${txn.quantity}`;
    const prev = seen.get(key);
    if (prev && prev.sourceFileId !== txn.sourceFileId) {
      issues.push({
        type: 'warning',
        symbol: txn.symbol,
        date: txn.settlementDate,
        message: `Possible duplicate: ${txn.action} ${txn.quantity} ${txn.symbol} on ${format(txn.settlementDate, 'yyyy-MM-dd')} appears in multiple files.`,
      });
    } else {
      seen.set(key, txn);
    }
  }

  // 3. Sells without prior buys
  const firstBuy = new Map<string, Date>();
  const firstSell = new Map<string, Date>();
  for (const txn of sorted) {
    if (txn.action === 'BUY' && !firstBuy.has(txn.symbol)) {
      firstBuy.set(txn.symbol, txn.settlementDate);
    }
    if (txn.action === 'SELL' && !firstSell.has(txn.symbol)) {
      firstSell.set(txn.symbol, txn.settlementDate);
    }
  }
  for (const [symbol, sellDate] of firstSell) {
    const buyDate = firstBuy.get(symbol);
    if (!buyDate || buyDate > sellDate) {
      issues.push({
        type: 'warning',
        symbol,
        date: sellDate,
        message: `Sell of ${symbol} on ${format(sellDate, 'yyyy-MM-dd')} occurs before any buy. You may be missing earlier transaction history.`,
      });
    }
  }

  return issues;
}

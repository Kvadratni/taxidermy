import { describe, it, expect } from 'vitest';
import { calculateDispositions, createAcbState } from '@/lib/engine/acb';
import { detectSuperficialLosses } from '@/lib/engine/superficial-loss';
import { Transaction } from '@/types';

function makeTxn(overrides: Partial<Transaction>): Transaction {
  return {
    id: Math.random().toString(36).slice(2),
    date: new Date('2025-01-10'),
    settlementDate: new Date('2025-01-12'),
    action: 'BUY',
    symbol: 'AAPL',
    quantity: 100,
    pricePerShare: 10,
    pricePerShareCAD: 10,
    commission: 0,
    currency: 'CAD',
    fxRate: 1,
    totalCAD: 1000,
    ...overrides,
  };
}

describe('detectSuperficialLosses', () => {
  it('denies full loss when all shares repurchased within 30 days and held', () => {
    const txns: Transaction[] = [
      makeTxn({ id: 'buy1', action: 'BUY', quantity: 100, pricePerShareCAD: 20, settlementDate: new Date('2025-01-01') }),
      makeTxn({ id: 'sell1', action: 'SELL', quantity: 100, pricePerShareCAD: 15, settlementDate: new Date('2025-06-01') }),
      // Repurchase within 30 days and hold
      makeTxn({ id: 'buy2', action: 'BUY', quantity: 100, pricePerShareCAD: 14, settlementDate: new Date('2025-06-10') }),
    ];

    const { dispositions, acbState } = calculateDispositions(txns);
    const slDetails = detectSuperficialLosses(txns, dispositions, acbState);

    expect(slDetails).toHaveLength(1);
    expect(slDetails[0].deniedLoss).toBeCloseTo(500); // full $500 loss denied
    expect(dispositions[0].isSuperficialLoss).toBe(true);
    expect(dispositions[0].allowedGainLoss).toBeCloseTo(0);
  });

  it('denies partial loss when only some shares repurchased (CRA formula)', () => {
    const txns: Transaction[] = [
      makeTxn({ id: 'buy1', action: 'BUY', quantity: 100, pricePerShareCAD: 20, settlementDate: new Date('2025-01-01') }),
      makeTxn({ id: 'sell1', action: 'SELL', quantity: 100, pricePerShareCAD: 15, settlementDate: new Date('2025-06-01') }),
      // Buy back only 40 shares within 30 days
      makeTxn({ id: 'buy2', action: 'BUY', quantity: 40, pricePerShareCAD: 14, settlementDate: new Date('2025-06-10') }),
    ];

    const { dispositions, acbState } = calculateDispositions(txns);
    const slDetails = detectSuperficialLosses(txns, dispositions, acbState);

    // S=100, P=40, B=40 → min(100,40,40)/100 * 500 = 0.4 * 500 = 200
    expect(slDetails).toHaveLength(1);
    expect(slDetails[0].deniedLoss).toBeCloseTo(200);
    expect(dispositions[0].allowedGainLoss).toBeCloseTo(-300); // -500 + 200
  });

  it('allows full loss when no repurchase in window', () => {
    const txns: Transaction[] = [
      makeTxn({ id: 'buy1', action: 'BUY', quantity: 100, pricePerShareCAD: 20, settlementDate: new Date('2025-01-01') }),
      makeTxn({ id: 'sell1', action: 'SELL', quantity: 100, pricePerShareCAD: 15, settlementDate: new Date('2025-06-01') }),
      // Buy back after the 30-day window
      makeTxn({ id: 'buy2', action: 'BUY', quantity: 100, pricePerShareCAD: 14, settlementDate: new Date('2025-08-01') }),
    ];

    const { dispositions, acbState } = calculateDispositions(txns);
    const slDetails = detectSuperficialLosses(txns, dispositions, acbState);

    expect(slDetails).toHaveLength(0);
    expect(dispositions[0].isSuperficialLoss).toBe(false);
    expect(dispositions[0].allowedGainLoss).toBeCloseTo(-500);
  });

  it('allows loss when repurchased but not held at day +30', () => {
    const txns: Transaction[] = [
      makeTxn({ id: 'buy1', action: 'BUY', quantity: 100, pricePerShareCAD: 20, settlementDate: new Date('2025-01-01') }),
      makeTxn({ id: 'sell1', action: 'SELL', quantity: 100, pricePerShareCAD: 15, settlementDate: new Date('2025-06-01') }),
      // Buy within window
      makeTxn({ id: 'buy2', action: 'BUY', quantity: 100, pricePerShareCAD: 14, settlementDate: new Date('2025-06-10') }),
      // Sell again before day +30 (so B=0 at day+30)
      makeTxn({ id: 'sell2', action: 'SELL', quantity: 100, pricePerShareCAD: 16, settlementDate: new Date('2025-06-20') }),
    ];

    const { dispositions, acbState } = calculateDispositions(txns);
    const slDetails = detectSuperficialLosses(txns, dispositions, acbState);

    // B=0 at day+30, so no superficial loss on sell1
    const sl1 = slDetails.find((s) => s.dispositionId === 'sell1');
    expect(sl1).toBeUndefined();
    expect(dispositions[0].isSuperficialLoss).toBe(false);
  });

  it('does not flag gains as superficial losses', () => {
    const txns: Transaction[] = [
      makeTxn({ id: 'buy1', action: 'BUY', quantity: 100, pricePerShareCAD: 10, settlementDate: new Date('2025-01-01') }),
      makeTxn({ id: 'sell1', action: 'SELL', quantity: 100, pricePerShareCAD: 20, settlementDate: new Date('2025-06-01') }),
      makeTxn({ id: 'buy2', action: 'BUY', quantity: 100, pricePerShareCAD: 18, settlementDate: new Date('2025-06-10') }),
    ];

    const { dispositions, acbState } = calculateDispositions(txns);
    const slDetails = detectSuperficialLosses(txns, dispositions, acbState);

    expect(slDetails).toHaveLength(0);
    expect(dispositions[0].isSuperficialLoss).toBe(false);
  });
});

import { describe, it, expect } from 'vitest';
import { calculateGains } from '@/lib/engine/gains';
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

describe('superficial loss detection', () => {
  it('denies full loss when all shares repurchased within 30 days and held', () => {
    const txns: Transaction[] = [
      makeTxn({ id: 'buy1', action: 'BUY', quantity: 100, pricePerShareCAD: 20, settlementDate: new Date('2025-01-01') }),
      makeTxn({ id: 'sell1', action: 'SELL', quantity: 100, pricePerShareCAD: 15, settlementDate: new Date('2025-06-01') }),
      makeTxn({ id: 'buy2', action: 'BUY', quantity: 100, pricePerShareCAD: 14, settlementDate: new Date('2025-06-10') }),
    ];

    const { dispositions, superficialLosses } = calculateGains(txns);

    expect(superficialLosses).toHaveLength(1);
    expect(superficialLosses[0].deniedLoss).toBeCloseTo(500);
    expect(dispositions[0].isSuperficialLoss).toBe(true);
    expect(dispositions[0].allowedGainLoss).toBeCloseTo(0);
  });

  it('denies partial loss when only some shares repurchased (CRA formula)', () => {
    const txns: Transaction[] = [
      makeTxn({ id: 'buy1', action: 'BUY', quantity: 100, pricePerShareCAD: 20, settlementDate: new Date('2025-01-01') }),
      makeTxn({ id: 'sell1', action: 'SELL', quantity: 100, pricePerShareCAD: 15, settlementDate: new Date('2025-06-01') }),
      makeTxn({ id: 'buy2', action: 'BUY', quantity: 40, pricePerShareCAD: 14, settlementDate: new Date('2025-06-10') }),
    ];

    const { dispositions, superficialLosses } = calculateGains(txns);

    // S=100, P=40, B=40 → min(100,40,40)/100 * 500 = 0.4 * 500 = 200
    expect(superficialLosses).toHaveLength(1);
    expect(superficialLosses[0].deniedLoss).toBeCloseTo(200);
    expect(dispositions[0].allowedGainLoss).toBeCloseTo(-300); // -500 + 200
  });

  it('allows full loss when no repurchase in window', () => {
    const txns: Transaction[] = [
      makeTxn({ id: 'buy1', action: 'BUY', quantity: 100, pricePerShareCAD: 20, settlementDate: new Date('2025-01-01') }),
      makeTxn({ id: 'sell1', action: 'SELL', quantity: 100, pricePerShareCAD: 15, settlementDate: new Date('2025-06-01') }),
      makeTxn({ id: 'buy2', action: 'BUY', quantity: 100, pricePerShareCAD: 14, settlementDate: new Date('2025-08-01') }),
    ];

    const { dispositions, superficialLosses } = calculateGains(txns);

    expect(superficialLosses).toHaveLength(0);
    expect(dispositions[0].isSuperficialLoss).toBe(false);
    expect(dispositions[0].allowedGainLoss).toBeCloseTo(-500);
  });

  it('allows loss when repurchased but not held at day +30', () => {
    const txns: Transaction[] = [
      makeTxn({ id: 'buy1', action: 'BUY', quantity: 100, pricePerShareCAD: 20, settlementDate: new Date('2025-01-01') }),
      makeTxn({ id: 'sell1', action: 'SELL', quantity: 100, pricePerShareCAD: 15, settlementDate: new Date('2025-06-01') }),
      makeTxn({ id: 'buy2', action: 'BUY', quantity: 100, pricePerShareCAD: 14, settlementDate: new Date('2025-06-10') }),
      makeTxn({ id: 'sell2', action: 'SELL', quantity: 100, pricePerShareCAD: 16, settlementDate: new Date('2025-06-20') }),
    ];

    const { dispositions, superficialLosses } = calculateGains(txns);

    // B=0 at day+30, so no superficial loss on sell1
    const sl1 = superficialLosses.find((s) => s.dispositionId === 'sell1');
    expect(sl1).toBeUndefined();
    expect(dispositions[0].isSuperficialLoss).toBe(false);
  });

  it('does not flag gains as superficial losses', () => {
    const txns: Transaction[] = [
      makeTxn({ id: 'buy1', action: 'BUY', quantity: 100, pricePerShareCAD: 10, settlementDate: new Date('2025-01-01') }),
      makeTxn({ id: 'sell1', action: 'SELL', quantity: 100, pricePerShareCAD: 20, settlementDate: new Date('2025-06-01') }),
      makeTxn({ id: 'buy2', action: 'BUY', quantity: 100, pricePerShareCAD: 18, settlementDate: new Date('2025-06-10') }),
    ];

    const { dispositions, superficialLosses } = calculateGains(txns);

    expect(superficialLosses).toHaveLength(0);
    expect(dispositions[0].isSuperficialLoss).toBe(false);
  });
});

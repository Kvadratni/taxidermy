import { describe, it, expect } from 'vitest';
import {
  createAcbState,
  processBuy,
  processSell,
  processSplit,
  processRoc,
  calculateDispositions,
} from '@/lib/engine/acb';
import { Transaction } from '@/types';

function makeTxn(overrides: Partial<Transaction>): Transaction {
  return {
    id: Math.random().toString(36).slice(2),
    date: new Date('2025-01-10'),
    settlementDate: new Date('2025-01-12'),
    action: 'BUY',
    symbol: 'AAPL',
    quantity: 100,
    pricePerShare: 150,
    pricePerShareCAD: 150,
    commission: 9.99,
    currency: 'CAD',
    fxRate: 1,
    totalCAD: 15009.99,
    ...overrides,
  };
}

describe('processBuy', () => {
  it('adds shares and cost including commission', () => {
    const state = createAcbState();
    processBuy(state, makeTxn({ quantity: 100, pricePerShareCAD: 10, commission: 5 }));
    const rec = state.records.get('AAPL')!;
    expect(rec.totalShares).toBe(100);
    expect(rec.totalAcb).toBeCloseTo(1005);
    expect(rec.acbPerShare).toBeCloseTo(10.05);
  });

  it('averages correctly on multiple buys', () => {
    const state = createAcbState();
    processBuy(state, makeTxn({ quantity: 100, pricePerShareCAD: 10, commission: 5 }));
    processBuy(state, makeTxn({ quantity: 100, pricePerShareCAD: 12, commission: 5 }));
    const rec = state.records.get('AAPL')!;
    expect(rec.totalShares).toBe(200);
    expect(rec.totalAcb).toBeCloseTo(2210); // 1005 + 1205
    expect(rec.acbPerShare).toBeCloseTo(11.05);
  });
});

describe('processSell', () => {
  it('calculates gain correctly', () => {
    const state = createAcbState();
    processBuy(state, makeTxn({ quantity: 100, pricePerShareCAD: 10, commission: 5 }));
    const result = processSell(
      state,
      makeTxn({ action: 'SELL', quantity: 50, pricePerShareCAD: 15, commission: 5 })
    );
    expect(result.acbOfSharesSold).toBeCloseTo(50 * 10.05); // 502.50
    expect(result.proceeds).toBeCloseTo(50 * 15); // 750
    expect(result.outlays).toBeCloseTo(5);
    expect(result.rawGainLoss).toBeCloseTo(750 - 502.50 - 5); // 242.50
  });

  it('calculates loss correctly', () => {
    const state = createAcbState();
    processBuy(state, makeTxn({ quantity: 100, pricePerShareCAD: 20, commission: 0 }));
    const result = processSell(
      state,
      makeTxn({ action: 'SELL', quantity: 100, pricePerShareCAD: 15, commission: 0 })
    );
    expect(result.rawGainLoss).toBeCloseTo(-500);
  });

  it('reduces ACB after partial sell', () => {
    const state = createAcbState();
    processBuy(state, makeTxn({ quantity: 200, pricePerShareCAD: 10, commission: 0 }));
    processSell(state, makeTxn({ action: 'SELL', quantity: 100, pricePerShareCAD: 12, commission: 0 }));
    const rec = state.records.get('AAPL')!;
    expect(rec.totalShares).toBe(100);
    expect(rec.totalAcb).toBeCloseTo(1000);
    expect(rec.acbPerShare).toBeCloseTo(10);
  });
});

describe('processSplit', () => {
  it('doubles shares, ACB unchanged, per-share halved', () => {
    const state = createAcbState();
    processBuy(state, makeTxn({ quantity: 100, pricePerShareCAD: 20, commission: 0 }));
    processSplit(state, makeTxn({ action: 'SPLIT', splitRatio: 2, quantity: 0 }));
    const rec = state.records.get('AAPL')!;
    expect(rec.totalShares).toBe(200);
    expect(rec.totalAcb).toBeCloseTo(2000);
    expect(rec.acbPerShare).toBeCloseTo(10);
  });
});

describe('processRoc', () => {
  it('reduces ACB by return of capital amount', () => {
    const state = createAcbState();
    processBuy(state, makeTxn({ quantity: 100, pricePerShareCAD: 10, commission: 0 }));
    processRoc(state, makeTxn({ action: 'ROC', rocPerShare: 2, quantity: 0 }));
    const rec = state.records.get('AAPL')!;
    expect(rec.totalAcb).toBeCloseTo(800); // 1000 - 200
    expect(rec.acbPerShare).toBeCloseTo(8);
  });

  it('clamps ACB at 0, does not go negative', () => {
    const state = createAcbState();
    processBuy(state, makeTxn({ quantity: 100, pricePerShareCAD: 5, commission: 0 }));
    processRoc(state, makeTxn({ action: 'ROC', rocPerShare: 10, quantity: 0 }));
    const rec = state.records.get('AAPL')!;
    expect(rec.totalAcb).toBe(0);
  });
});

describe('calculateDispositions', () => {
  it('processes multiple symbols independently', () => {
    const txns: Transaction[] = [
      makeTxn({ id: '1', symbol: 'AAPL', action: 'BUY', quantity: 100, pricePerShareCAD: 10, commission: 0, settlementDate: new Date('2025-01-02') }),
      makeTxn({ id: '2', symbol: 'MSFT', action: 'BUY', quantity: 50, pricePerShareCAD: 20, commission: 0, settlementDate: new Date('2025-01-03') }),
      makeTxn({ id: '3', symbol: 'AAPL', action: 'SELL', quantity: 100, pricePerShareCAD: 15, commission: 0, settlementDate: new Date('2025-06-01') }),
    ];
    const { dispositions } = calculateDispositions(txns);
    expect(dispositions).toHaveLength(1);
    expect(dispositions[0].rawGainLoss).toBeCloseTo(500);
    expect(dispositions[0].transaction.symbol).toBe('AAPL');
  });

  it('sorts transactions by settlement date', () => {
    const txns: Transaction[] = [
      makeTxn({ id: '1', action: 'SELL', quantity: 100, pricePerShareCAD: 15, commission: 0, settlementDate: new Date('2025-06-01') }),
      makeTxn({ id: '2', action: 'BUY', quantity: 100, pricePerShareCAD: 10, commission: 0, settlementDate: new Date('2025-01-01') }),
    ];
    const { dispositions } = calculateDispositions(txns);
    expect(dispositions[0].rawGainLoss).toBeCloseTo(500);
  });
});

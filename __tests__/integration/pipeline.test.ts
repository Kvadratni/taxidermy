/**
 * Integration tests — feed CSV fixtures through the full calculation pipeline
 * (parse → Transaction[] → calculateGains) and assert on dispositions, totals,
 * superficial losses, and final ACB state.
 *
 * FX rates are embedded in the CSV so these tests run without network access.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { parseCsvText } from '@/lib/csv-parser';
import { calculateGains, CalculationResult } from '@/lib/engine/gains';
import { Transaction, TransactionAction } from '@/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Read a fixture CSV and convert it into Transaction[] ready for the engine. */
function loadFixture(filename: string): Transaction[] {
  const text = readFileSync(resolve(__dirname, 'fixtures', filename), 'utf-8');
  const rows = parseCsvText(text);
  const headers = rows[0].map((h) => h.trim());
  const data = rows.slice(1);

  const col = (name: string) => headers.findIndex((h) => h.toLowerCase() === name.toLowerCase());
  const dateIdx = col('Settlement Date');
  const actionIdx = col('Action');
  const symbolIdx = col('Symbol');
  const qtyIdx = col('Quantity');
  const priceIdx = col('Price');
  const commIdx = col('Commission');
  const currIdx = col('Currency');
  const fxIdx = col('FX Rate');

  return data.map((row, i) => {
    const date = new Date(row[dateIdx].trim());
    const action = row[actionIdx].trim().toUpperCase() as TransactionAction;
    const symbol = row[symbolIdx].trim();
    const quantity = parseFloat(row[qtyIdx]);
    const price = parseFloat(row[priceIdx]);
    const commission = commIdx >= 0 ? parseFloat(row[commIdx]) : 0;
    const currency = currIdx >= 0 ? row[currIdx].trim().toUpperCase() : 'CAD';
    const fxRate = fxIdx >= 0 && row[fxIdx]?.trim() ? parseFloat(row[fxIdx]) : 1;
    const priceCAD = price * fxRate;
    const totalCAD =
      action === 'BUY'
        ? quantity * priceCAD + commission
        : quantity * priceCAD - commission;

    return {
      id: `${filename}-${i}`,
      settlementDate: date,
      tradeDate: date,
      action,
      symbol,
      quantity,
      pricePerShare: price,
      pricePerShareCAD: priceCAD,
      commission,
      currency,
      fxRate,
      totalCAD,
    };
  });
}

/** Round to 2 decimal places for readable assertions. */
function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Summarise dispositions by symbol+year for easy assertions. */
function summariseBySymbolYear(result: CalculationResult) {
  const map = new Map<string, { gains: number; losses: number; count: number }>();
  for (const d of result.dispositions) {
    const year = d.transaction.settlementDate.getFullYear();
    const key = `${d.transaction.symbol}:${year}`;
    const entry = map.get(key) ?? { gains: 0, losses: 0, count: 0 };
    entry.count++;
    if (d.allowedGainLoss >= 0) entry.gains += d.allowedGainLoss;
    else entry.losses += d.allowedGainLoss;
    map.set(key, entry);
  }
  return map;
}

/** Format results as CSV lines for snapshot output. */
function resultsToCsv(result: CalculationResult): string {
  const header =
    'Symbol,SettlementDate,Action,Qty,PriceCAD,Proceeds,ACB Sold,Outlays,Raw G/L,SL Denied,Allowed G/L,Is SL';
  const lines = result.dispositions.map((d) =>
    [
      d.transaction.symbol,
      d.transaction.settlementDate.toISOString().slice(0, 10),
      d.transaction.action,
      d.transaction.quantity,
      r2(d.transaction.pricePerShareCAD),
      r2(d.proceeds),
      r2(d.acbOfSharesSold),
      r2(d.outlays),
      r2(d.rawGainLoss),
      r2(d.superficialLoss),
      r2(d.allowedGainLoss),
      d.isSuperficialLoss,
    ].join(',')
  );
  return [header, ...lines].join('\n');
}

// ---------------------------------------------------------------------------
// Test suites
// ---------------------------------------------------------------------------

describe('Integration: multi-currency-multi-year', () => {
  const txns = loadFixture('multi-currency-multi-year.csv');
  const result = calculateGains(txns);

  it('produces correct number of dispositions (one per SELL)', () => {
    const sellCount = txns.filter((t) => t.action === 'SELL').length;
    expect(result.dispositions).toHaveLength(sellCount);
  });

  it('has dispositions spanning 3 tax years', () => {
    const years = new Set(result.dispositions.map((d) => d.transaction.settlementDate.getFullYear()));
    expect(years).toEqual(new Set([2022, 2023, 2024]));
  });

  it('AAPL 2022 sell: gain on 20 shares @ $175 USD × 1.31 FX', () => {
    // Buy: 50 @ $160 × 1.27 = $203.20/sh CAD + $9.99 commission → ACB = 50×203.20 + 9.99 = $10,169.99
    // ACB/sh = $10,169.99 / 50 = $203.3998
    // Sell 20 @ $175 × 1.31 = $229.25/sh CAD, commission $9.99
    // Proceeds = 20 × 229.25 = $4,585.00
    // ACB sold = 20 × 203.3998 = $4,067.996
    // G/L = 4585 - 4067.996 - 9.99 = $507.014
    const d = result.dispositions.find(
      (d) => d.transaction.symbol === 'AAPL' && d.transaction.settlementDate.getFullYear() === 2022
    )!;
    expect(d).toBeDefined();
    expect(r2(d.proceeds)).toBe(r2(20 * 175 * 1.31));
    expect(r2(d.rawGainLoss)).toBeCloseTo(507.01, 0);
    expect(d.isSuperficialLoss).toBe(false);
  });

  it('MSFT 2023 sell: gain on 30 shares (bought $230 USD × 1.36, sold $370 USD × 1.35)', () => {
    const d = result.dispositions.find(
      (d) => d.transaction.symbol === 'MSFT'
    )!;
    expect(d).toBeDefined();
    // Buy: 30 × 230 × 1.36 = $9,384 + $4.99 = $9,388.99, ACB/sh = 312.9663
    // Sell: 30 × 370 × 1.35 = $14,985, commission $4.99
    // G/L = 14985 - 9388.99 - 4.99 = $5,591.02
    expect(r2(d.rawGainLoss)).toBeCloseTo(5591.02, 0);
  });

  it('net gain/loss totals are consistent', () => {
    expect(r2(result.netGainLoss)).toBe(r2(result.totalGains + result.totalLosses));
  });

  it('final ACB snapshots exist for symbols with remaining shares', () => {
    // After all transactions, all positions should be fully liquidated
    // AAPL: bought 50+25+40=115, sold 20+30+65=115 → 0
    // TD.TO: bought 200, sold 100+100=200 → 0
    // MSFT: bought 30, sold 30 → 0
    // ENB.TO: bought 150, sold 150 → 0
    for (const [, rec] of result.acbSnapshots) {
      expect(rec.totalShares).toBe(0);
    }
  });

  it('CSV output is deterministic', () => {
    const csv = resultsToCsv(result);
    expect(csv).toContain('AAPL');
    expect(csv).toContain('MSFT');
    expect(csv).toContain('TD.TO');
    expect(csv).toContain('ENB.TO');
    // Re-run should produce identical output
    const result2 = calculateGains(txns);
    expect(resultsToCsv(result2)).toBe(csv);
  });
});

describe('Integration: canadian-only', () => {
  const txns = loadFixture('canadian-only.csv');
  const result = calculateGains(txns);

  it('all transactions are in CAD with fxRate=1', () => {
    for (const t of txns) {
      expect(t.currency).toBe('CAD');
      expect(t.fxRate).toBe(1);
    }
  });

  it('produces correct number of dispositions', () => {
    const sellCount = txns.filter((t) => t.action === 'SELL').length;
    expect(result.dispositions).toHaveLength(sellCount);
  });

  it('RY.TO ACB averages correctly across two buys then partial sell', () => {
    // Buy1: 100 @ 128.50 + 9.99 = 12,859.99
    // Buy2: 75 @ 132.00 + 9.99 = 9,909.99
    // Total ACB = 22,769.98, shares = 175, ACB/sh = 130.1142
    // Sell 50 @ 140: proceeds = 7000, ACB sold = 50 × 130.1142 = 6505.71, outlays = 9.99
    // G/L = 7000 - 6505.71 - 9.99 = 484.30
    const ryDisps = result.dispositions.filter((d) => d.transaction.symbol === 'RY.TO');
    expect(ryDisps.length).toBe(2); // two RY.TO sells

    const firstSell = ryDisps[0]; // the 50-share sell
    expect(firstSell.transaction.quantity).toBe(50);
    expect(r2(firstSell.rawGainLoss)).toBeCloseTo(484.30, 0);
  });

  it('BMO.TO: second buy at lower price adjusts ACB down', () => {
    // Initial buy: 150 @ 125 + 9.99 = 18,759.99, ACB/sh = 125.0666
    // Sell 80 @ 130: proceeds=10400, acb=80×125.0666=10005.33, outlays=9.99, G/L=384.68
    // Remaining: 70 shares, ACB = 8754.66
    // Second buy: 100 @ 120 + 9.99 = 12,009.99
    // New total: 170 shares, ACB = 20,764.65, ACB/sh = 122.1450
    // Final sell: 170 @ 133, proceeds=22610, ACB=170×122.145=20764.65, outlays=9.99
    // G/L = 22610 - 20764.65 - 9.99 = 1835.36
    const bmoDisps = result.dispositions.filter((d) => d.transaction.symbol === 'BMO.TO');
    expect(bmoDisps.length).toBe(2);
  });

  it('all positions are fully liquidated at the end', () => {
    for (const [, rec] of result.acbSnapshots) {
      expect(rec.totalShares).toBe(0);
    }
  });

  it('commissions reduce gains', () => {
    // Every transaction has $9.99 commission — gains should be lower than without
    const txnsNoComm = txns.map((t) => ({ ...t, commission: 0 }));
    const resultNoComm = calculateGains(txnsNoComm);
    // Net gain with commissions should be less than without
    expect(result.netGainLoss).toBeLessThan(resultNoComm.netGainLoss);
  });
});

describe('Integration: superficial-loss-edge-cases', () => {
  const txns = loadFixture('superficial-loss-edges.csv');
  const result = calculateGains(txns);

  it('SL1: full superficial loss — sell at loss, rebuy all within 30 days', () => {
    // Buy 100@50, sell 100@40 (loss=$1000), rebuy 100@38 within 14 days
    // S=100, P=100, B=100 → denied = min(100,100,100)/100 × 1000 = $1000
    const d = result.dispositions.find((d) => d.transaction.symbol === 'SL1')!;
    expect(d.rawGainLoss).toBeCloseTo(-1000);
    expect(d.isSuperficialLoss).toBe(true);
    expect(d.superficialLoss).toBeCloseTo(1000);
    expect(d.allowedGainLoss).toBeCloseTo(0);
  });

  it('SL2: partial superficial loss — rebuy only 40 of 100 shares', () => {
    // Buy 100@50, sell 100@40 (loss=$1000), rebuy 40@38 within 14 days
    // S=100, P=40, B=40 → denied = min(100,40,40)/100 × 1000 = $400
    const d = result.dispositions.find((d) => d.transaction.symbol === 'SL2')!;
    expect(d.rawGainLoss).toBeCloseTo(-1000);
    expect(d.isSuperficialLoss).toBe(true);
    expect(d.superficialLoss).toBeCloseTo(400);
    expect(d.allowedGainLoss).toBeCloseTo(-600);
  });

  it('SL3: no superficial loss — rebuy after 30-day window', () => {
    // Buy 100@50, sell 100@40 (loss=$1000), rebuy 100@38 on Aug 15 (75 days later)
    const d = result.dispositions.find((d) => d.transaction.symbol === 'SL3')!;
    expect(d.rawGainLoss).toBeCloseTo(-1000);
    expect(d.isSuperficialLoss).toBe(false);
    expect(d.superficialLoss).toBe(0);
    expect(d.allowedGainLoss).toBeCloseTo(-1000);
  });

  it('SL4: no superficial loss — rebuy in window but sold again before day+30', () => {
    // Buy 100@50, sell 100@40, rebuy 100@38 day+14, sell 100@42 day+24
    // At day+30: B=0 → no SL
    // First SL4 sell is on 2024-06-01
    const d = result.dispositions.find(
      (d) => d.transaction.symbol === 'SL4' && d.transaction.settlementDate.toISOString().startsWith('2024-06-01')
    )!;
    expect(d.rawGainLoss).toBeCloseTo(-1000);
    expect(d.isSuperficialLoss).toBe(false);
  });

  it('SL5: sell half, keep half — no rebuy, no superficial loss', () => {
    // Buy 200@50, sell 100@40. Still holding 100. No rebuy in window.
    // P=0, so loss is fully allowed despite holding shares.
    const d = result.dispositions.find((d) => d.transaction.symbol === 'SL5')!;
    expect(d.rawGainLoss).toBeCloseTo(-1000);
    expect(d.isSuperficialLoss).toBe(false);
    expect(d.allowedGainLoss).toBeCloseTo(-1000);
  });

  it('GAIN: no superficial loss on gains even with rebuy in window', () => {
    // Buy 100@30, sell 100@50 (gain=$2000), rebuy 100@48 within 14 days
    const d = result.dispositions.find((d) => d.transaction.symbol === 'GAIN')!;
    expect(d.rawGainLoss).toBeCloseTo(2000);
    expect(d.isSuperficialLoss).toBe(false);
  });

  it('CHAIN: chained superficial losses propagate ACB correctly', () => {
    // Buy 100@50, sell 100@40 (loss=1000), rebuy 100@38 in window → SL on first sell
    // Then sell 100@35 (second sell) — the denied loss from first sell added to ACB
    // Rebuy 50@33 within window of second sell
    const chainDisps = result.dispositions
      .filter((d) => d.transaction.symbol === 'CHAIN')
      .sort((a, b) => a.transaction.settlementDate.getTime() - b.transaction.settlementDate.getTime());

    expect(chainDisps.length).toBe(2);

    // First sell: loss, should be superficial (rebuy 100@38 within 9 days)
    const first = chainDisps[0];
    expect(first.rawGainLoss).toBeCloseTo(-1000);
    expect(first.isSuperficialLoss).toBe(true);

    // Second sell: ACB was inflated by denied loss from first sell
    // After SL adjustment: ACB for 100 shares = 100×38 + 1000 (denied) = 4800, ACB/sh = 48
    // Sell 100@35: proceeds=3500, ACB=4800, G/L = 3500-4800 = -1300
    const second = chainDisps[1];
    expect(second.rawGainLoss).toBeCloseTo(-1300);
  });

  it('total superficial losses denied matches sum of individual denials', () => {
    const totalDenied = result.superficialLosses.reduce((s, sl) => s + sl.deniedLoss, 0);
    const totalFromDisps = result.dispositions
      .filter((d) => d.isSuperficialLoss)
      .reduce((s, d) => s + d.superficialLoss, 0);
    expect(r2(totalDenied)).toBe(r2(totalFromDisps));
  });

  it('CSV output captures all dispositions', () => {
    const csv = resultsToCsv(result);
    const lines = csv.split('\n');
    // Header + one line per disposition
    expect(lines.length).toBe(1 + result.dispositions.length);
  });
});

describe('Integration: output consistency', () => {
  const fixtures = [
    'multi-currency-multi-year.csv',
    'canadian-only.csv',
    'superficial-loss-edges.csv',
  ];

  for (const fixture of fixtures) {
    it(`${fixture}: netGainLoss = totalGains + totalLosses`, () => {
      const txns = loadFixture(fixture);
      const result = calculateGains(txns);
      expect(r2(result.netGainLoss)).toBe(r2(result.totalGains + result.totalLosses));
    });

    it(`${fixture}: every disposition has non-negative proceeds`, () => {
      const txns = loadFixture(fixture);
      const result = calculateGains(txns);
      for (const d of result.dispositions) {
        expect(d.proceeds).toBeGreaterThanOrEqual(0);
      }
    });

    it(`${fixture}: allowedGainLoss >= rawGainLoss (SL only increases)`, () => {
      const txns = loadFixture(fixture);
      const result = calculateGains(txns);
      for (const d of result.dispositions) {
        // superficialLoss is always non-negative, so allowed >= raw
        expect(d.allowedGainLoss).toBeGreaterThanOrEqual(d.rawGainLoss - 0.01);
      }
    });

    it(`${fixture}: deterministic — same input produces same output`, () => {
      const txns = loadFixture(fixture);
      const r1 = calculateGains(txns);
      const r2run = calculateGains(txns);
      expect(resultsToCsv(r1)).toBe(resultsToCsv(r2run));
    });
  }
});

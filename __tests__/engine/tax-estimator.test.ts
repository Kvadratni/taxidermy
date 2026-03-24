import { describe, it, expect } from 'vitest';
import { estimateTax } from '@/lib/engine/tax-estimator';

describe('estimateTax', () => {
  it('returns zero tax on zero gains', () => {
    const result = estimateTax(0, 'BC');
    expect(result.combinedTax).toBe(0);
    expect(result.federalTax).toBe(0);
    expect(result.provincialTax).toBe(0);
  });

  it('returns zero tax on negative gains (losses)', () => {
    const result = estimateTax(-5000, 'BC');
    expect(result.combinedTax).toBe(0);
    expect(result.taxableCapitalGains).toBe(0);
  });

  it('applies 50% inclusion rate', () => {
    const result = estimateTax(10000, 'ON');
    expect(result.taxableCapitalGains).toBeCloseTo(5000);
  });

  it('calculates BC provincial tax correctly', () => {
    const result = estimateTax(50000, 'BC');
    // Taxable = 25000
    // Federal: 25000 * 0.15 = 3750
    // BC: 25000 * 0.0506 (first bracket up to 47937) = 1265
    expect(result.taxableCapitalGains).toBeCloseTo(25000);
    expect(result.federalTax).toBeCloseTo(3750);
    expect(result.provincialTax).toBeCloseTo(1265);
  });

  it('applies correct federal brackets for larger gains', () => {
    // Net gain = 300000, taxable = 150000
    // Federal: 57375 * 0.15 = 8606.25
    //          (114750-57375) * 0.205 = 11762.38
    //          (150000-114750) * 0.26 = 9165
    const result = estimateTax(300000, 'AB');
    expect(result.taxableCapitalGains).toBeCloseTo(150000);
    const expectedFederal = 57375 * 0.15 + (114750 - 57375) * 0.205 + (150000 - 114750) * 0.26;
    expect(result.federalTax).toBeCloseTo(expectedFederal, 0);
  });

  it('includes bracket breakdown', () => {
    const result = estimateTax(100000, 'ON');
    expect(result.bracketBreakdown.length).toBeGreaterThan(0);
    const federal = result.bracketBreakdown.filter((b) => b.level === 'federal');
    const provincial = result.bracketBreakdown.filter((b) => b.level === 'provincial');
    expect(federal.length).toBeGreaterThan(0);
    expect(provincial.length).toBeGreaterThan(0);
  });

  it('effectiveRate is sensible for a typical gain', () => {
    const result = estimateTax(100000, 'BC');
    // Effective rate on gains (not on taxable portion) should be reasonable
    expect(result.effectiveRate).toBeGreaterThan(0.05);
    expect(result.effectiveRate).toBeLessThan(0.3);
  });
});

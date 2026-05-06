import { describe, expect, it } from 'vitest';
import { buildColumnMapping, shouldForceTotalMapping } from '@/lib/mapping/build-mapping';
import { ColumnMapping } from '@/types';

const standardAssignments: Record<number, string> = {
  0: 'date',
  1: 'action',
  2: 'symbol',
  3: 'quantity',
  4: 'price',
  5: 'commission',
  6: 'currency',
};

describe('shouldForceTotalMapping', () => {
  it('forces totals for detected Questrade files', () => {
    expect(
      shouldForceTotalMapping({
        detectedFormat: 'Questrade',
        existingMapping: null,
      })
    ).toBe(true);
  });

  it('preserves previously saved forceTotal mappings', () => {
    const existingMapping: ColumnMapping = {
      date: 0,
      action: 1,
      symbol: 2,
      quantity: 3,
      price: 4,
      forceTotal: true,
    };

    expect(
      shouldForceTotalMapping({
        detectedFormat: null,
        existingMapping,
      })
    ).toBe(true);
  });
});

describe('buildColumnMapping', () => {
  it('preserves forceTotal when rebuilding a detected Questrade mapping', () => {
    const mapping = buildColumnMapping(standardAssignments, {
      isGl: false,
      currency: 'CAD',
      detectedFormat: 'Questrade',
      existingMapping: null,
    });

    expect(mapping).toMatchObject({
      date: 0,
      action: 1,
      symbol: 2,
      quantity: 3,
      price: 4,
      commission: 5,
      currency: 6,
      forceTotal: true,
    });
  });

  it('does not enable total-mode for non-Questrade mappings', () => {
    const mapping = buildColumnMapping(standardAssignments, {
      isGl: false,
      currency: 'CAD',
      detectedFormat: 'AdjustedCostBase.ca',
      existingMapping: null,
    });

    expect(mapping?.forceTotal).toBeUndefined();
  });
});

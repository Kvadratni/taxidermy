import { describe, expect, it } from 'vitest';
import { detectFormat } from '@/lib/mapping/auto-detect';
import { mapToTransactions } from '@/lib/mapping/column-mapper';
import { ColumnMapping, RawImportData } from '@/types';

describe('mapToTransactions', () => {
  it('ignores unsupported Questrade activity rows instead of raising mapping errors', () => {
    const data: RawImportData = {
      headers: ['Transaction Date', 'Settlement Date', 'Action', 'Symbol', 'Quantity', 'Net Amount', 'Currency'],
      rows: [
        ['2024-01-02', '2024-01-04', 'Buy', 'AAPL', '10', '-1000.00', 'USD'],
        ['2024-01-05', '2024-01-05', 'DIV', 'AAPL', '', '5.00', 'USD'],
        ['2024-01-08', '2024-01-10', 'REI', 'AAPL', '0.1', '-10.00', 'USD'],
        ['2024-01-09', '2024-01-09', 'DEP', '', '', '1000.00', 'CAD'],
        ['2024-01-11', '2024-01-15', 'CIL', 'AAPL', '-0.25', '15.00', 'USD'],
      ],
      source: 'csv',
    };

    const detection = detectFormat(data.headers);
    expect(detection?.format).toBe('Questrade');

    const { transactions, errors } = mapToTransactions(data, detection!.mapping);

    expect(errors).toEqual([]);
    expect(transactions).toHaveLength(2);
    expect(transactions.map((txn) => txn.action)).toEqual(['BUY_TOTAL', 'BUY_TOTAL']);
  });

  it('ignores blank-action Questrade cash rows with zero quantity', () => {
    const data: RawImportData = {
      headers: [
        'Transaction Date',
        'Settlement Date',
        'Action',
        'Symbol',
        'Description',
        'Quantity',
        'Price',
        'Gross Amount',
        'Commission',
        'Net Amount',
        'Currency',
        'Activity Type',
      ],
      rows: [
        ['2026-04-16 12:00:00 AM', '2026-04-16 12:00:00 AM', '', '', 'Interest charge', '0.00000', '0.00000000', '0.00', '0.00', '-155.80', 'USD', 'Interest'],
        ['2026-04-15 12:00:00 AM', '2026-04-15 12:00:00 AM', '', 'BAM', 'Cash dividend', '0.00000', '0.00000000', '0.00', '0.00', '120.00', 'CAD', 'Dividends'],
        ['2026-04-14 12:00:00 AM', '2026-04-16 12:00:00 AM', 'Buy', 'AAPL', 'Trade', '10.00000', '0.00000000', '0.00', '0.00', '-1000.00', 'USD', 'Trades'],
      ],
      source: 'csv',
    };

    const detection = detectFormat(data.headers);
    expect(detection?.format).toBe('Questrade');

    const { transactions, errors } = mapToTransactions(data, detection!.mapping);

    expect(errors).toEqual([]);
    expect(transactions).toHaveLength(1);
    expect(transactions[0].action).toBe('BUY_TOTAL');
  });

  it('keeps surfacing unknown actions for non-Questrade mappings', () => {
    const data: RawImportData = {
      headers: ['Date', 'Action', 'Symbol', 'Quantity', 'Price', 'Currency'],
      rows: [['2024-01-02', 'Unexpected', 'AAPL', '1', '10', 'CAD']],
      source: 'csv',
    };

    const mapping: ColumnMapping = {
      date: 0,
      action: 1,
      symbol: 2,
      quantity: 3,
      price: 4,
      currency: 5,
    };

    const { transactions, errors } = mapToTransactions(data, mapping);

    expect(transactions).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toBe('Could not determine Buy/Sell action');
  });

  it('still infers BUY/SELL from quantity sign when no action column exists', () => {
    const data: RawImportData = {
      headers: ['Date/Time', 'Symbol', 'Quantity', 'T. Price', 'Currency'],
      rows: [
        ['2024-01-02', 'AAPL', '10', '100', 'USD'],
        ['2024-01-03', 'AAPL', '-4', '110', 'USD'],
      ],
      source: 'csv',
    };

    const mapping: ColumnMapping = {
      date: 0,
      symbol: 1,
      quantity: 2,
      price: 3,
      currency: 4,
    };

    const { transactions, errors } = mapToTransactions(data, mapping);

    expect(errors).toEqual([]);
    expect(transactions.map((txn) => txn.action)).toEqual(['BUY', 'SELL']);
  });
});

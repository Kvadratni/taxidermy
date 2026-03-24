'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { ColumnMapping } from '@/types';
import { detectFormat, suggestMapping } from '@/lib/mapping/auto-detect';
import { mapToTransactions, MappingError } from '@/lib/mapping/column-mapper';
import { fetchFxRates, lookupRate, getCachedRates } from '@/lib/engine/fx';
import { calculateGains } from '@/lib/engine/gains';
import { format as formatDate, min as dateMin, max as dateMax } from 'date-fns';
import { Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react';

const FIELD_OPTIONS = [
  { value: '', label: '-- Ignore --' },
  { value: 'date', label: 'Date' },
  { value: 'settlementDate', label: 'Settlement Date' },
  { value: 'action', label: 'Action (Buy/Sell)' },
  { value: 'symbol', label: 'Symbol / Ticker' },
  { value: 'quantity', label: 'Quantity' },
  { value: 'price', label: 'Price per Share' },
  { value: 'commission', label: 'Commission / Fees' },
  { value: 'currency', label: 'Currency' },
  { value: 'totalAmount', label: 'Total Amount' },
  // G&L report fields
  { value: 'dateSold', label: 'Date Sold (G&L)' },
  { value: 'dateAcquired', label: 'Date Acquired (G&L)' },
  { value: 'totalProceeds', label: 'Total Proceeds (G&L)' },
  { value: 'acbTotal', label: 'Adjusted Cost Basis (G&L)' },
];

const REQUIRED_FIELDS = ['date', 'action', 'symbol', 'quantity', 'price'];
const REQUIRED_FIELDS_GL = ['dateSold', 'totalProceeds', 'acbTotal', 'quantity'];

export default function ColumnMapper() {
  const rawData = useAppStore((s) => s.rawData);
  const setColumnMapping = useAppStore((s) => s.setColumnMapping);
  const setDetectedFormat = useAppStore((s) => s.setDetectedFormat);
  const setTransactions = useAppStore((s) => s.setTransactions);
  const setResults = useAppStore((s) => s.setResults);
  const setStep = useAppStore((s) => s.setStep);

  const [assignments, setAssignments] = useState<Record<number, string>>({});
  const [detectedName, setDetectedName] = useState<string | null>(null);
  const [isGlMode, setIsGlMode] = useState(false);
  const [glCurrency, setGlCurrency] = useState('USD');
  const [errors, setErrors] = useState<MappingError[]>([]);
  const [processing, setProcessing] = useState(false);
  const [fxStatus, setFxStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!rawData) return;

    // Try auto-detect
    const detection = detectFormat(rawData.headers);
    if (detection) {
      setDetectedName(detection.format);
      setDetectedFormat(detection.format);
      const gl = detection.mapping.glMode === true;
      setIsGlMode(gl);
      // Convert mapping to assignments
      const auto: Record<number, string> = {};
      const m = detection.mapping;
      if (gl) {
        if (m.dateSold !== undefined && m.dateSold >= 0) auto[m.dateSold] = 'dateSold';
        if (m.dateAcquired !== undefined && m.dateAcquired >= 0) auto[m.dateAcquired] = 'dateAcquired';
        if (m.totalProceeds !== undefined && m.totalProceeds >= 0) auto[m.totalProceeds] = 'totalProceeds';
        if (m.acbTotal !== undefined && m.acbTotal >= 0) auto[m.acbTotal] = 'acbTotal';
        if (m.quantity >= 0) auto[m.quantity] = 'quantity';
      } else {
        if (m.date >= 0) auto[m.date] = 'date';
        if (m.settlementDate !== undefined && m.settlementDate >= 0) auto[m.settlementDate] = 'settlementDate';
        if (m.action !== undefined && m.action >= 0) auto[m.action] = 'action';
        if (m.symbol !== undefined && m.symbol >= 0) auto[m.symbol] = 'symbol';
        if (m.quantity >= 0) auto[m.quantity] = 'quantity';
        if (m.price !== undefined && m.price >= 0) auto[m.price] = 'price';
        if (m.commission !== undefined && m.commission >= 0) auto[m.commission] = 'commission';
        if (m.currency !== undefined && m.currency >= 0) auto[m.currency] = 'currency';
        if (m.totalAmount !== undefined && m.totalAmount >= 0) auto[m.totalAmount] = 'totalAmount';
      }
      setAssignments(auto);
    } else {
      setIsGlMode(false);
      // Try fuzzy suggestion
      const suggestion = suggestMapping(rawData.headers);
      const auto: Record<number, string> = {};
      if (suggestion.date !== undefined) auto[suggestion.date] = 'date';
      if (suggestion.action !== undefined) auto[suggestion.action] = 'action';
      if (suggestion.symbol !== undefined) auto[suggestion.symbol] = 'symbol';
      if (suggestion.quantity !== undefined) auto[suggestion.quantity] = 'quantity';
      if (suggestion.price !== undefined) auto[suggestion.price] = 'price';
      if (suggestion.commission !== undefined) auto[suggestion.commission] = 'commission';
      if (suggestion.currency !== undefined) auto[suggestion.currency] = 'currency';
      setAssignments(auto);
    }
  }, [rawData, setDetectedFormat]);

  const buildMapping = useCallback((): ColumnMapping | null => {
    const reverse: Record<string, number> = {};
    for (const [colIdx, field] of Object.entries(assignments)) {
      if (field) reverse[field] = parseInt(colIdx);
    }

    const requiredFields = isGlMode ? REQUIRED_FIELDS_GL : REQUIRED_FIELDS;
    for (const req of requiredFields) {
      if (reverse[req] === undefined) return null;
    }

    if (isGlMode) {
      return {
        date: reverse.dateSold,
        quantity: reverse.quantity,
        glMode: true,
        glCurrency,
        dateSold: reverse.dateSold,
        dateAcquired: reverse.dateAcquired,
        totalProceeds: reverse.totalProceeds,
        acbTotal: reverse.acbTotal,
      };
    }

    return {
      date: reverse.date,
      action: reverse.action,
      symbol: reverse.symbol,
      quantity: reverse.quantity,
      price: reverse.price,
      commission: reverse.commission,
      currency: reverse.currency,
      totalAmount: reverse.totalAmount,
      settlementDate: reverse.settlementDate,
    };
  }, [assignments, isGlMode, glCurrency]);

  const mapping = buildMapping();
  const activeRequiredFields = isGlMode ? REQUIRED_FIELDS_GL : REQUIRED_FIELDS;
  const missingFields = activeRequiredFields.filter((f) => {
    return !Object.values(assignments).includes(f);
  });

  const handleProcess = async () => {
    if (!rawData || !mapping) return;
    setProcessing(true);
    setErrors([]);
    setFxStatus(null);

    try {
      setColumnMapping(mapping);

      // Map to transactions
      const { transactions, errors: mapErrors } = mapToTransactions(rawData, mapping);
      setErrors(mapErrors);

      if (transactions.length === 0) {
        setProcessing(false);
        return;
      }

      // FX conversion for non-CAD transactions
      const foreignTxns = transactions.filter((t) => t.currency !== 'CAD');
      if (foreignTxns.length > 0) {
        const currencies = [...new Set(foreignTxns.map((t) => t.currency))];

        for (const currency of currencies) {
          setFxStatus(`Fetching ${currency}/CAD exchange rates...`);
          const txnsForCurrency = foreignTxns.filter((t) => t.currency === currency);
          const dates = txnsForCurrency.map((t) => t.settlementDate);
          const startDate = dateMin(dates);
          const endDate = dateMax(dates);

          let rates = getCachedRates(currency);
          try {
            const fetched = await fetchFxRates(currency, startDate, endDate);
            rates = { ...rates, ...fetched };
          } catch {
            setFxStatus(`Warning: Could not fetch ${currency} rates. Using cached or 1.0.`);
          }

          for (const txn of txnsForCurrency) {
            try {
              txn.fxRate = lookupRate(rates, txn.settlementDate);
            } catch {
              txn.fxRate = 1;
            }
            txn.pricePerShareCAD = txn.pricePerShare * txn.fxRate;
            txn.commission = txn.commission * txn.fxRate;
            txn.totalCAD = txn.quantity * txn.pricePerShareCAD +
              (txn.action === 'BUY' ? txn.commission : -txn.commission);
          }
        }
      }

      setFxStatus(null);
      setTransactions(transactions);

      // Run calculation
      const result = calculateGains(transactions);
      setResults(result.dispositions, result.superficialLosses, result.acbSnapshots);
    } catch (err) {
      setErrors([{
        row: 0,
        field: 'general',
        value: '',
        message: err instanceof Error ? err.message : 'Processing failed',
      }]);
    } finally {
      setProcessing(false);
    }
  };

  if (!rawData) return null;

  const previewRows = rawData.rows.slice(0, 5);

  return (
    <div className="mx-auto max-w-6xl">
      <h2 className="text-lg font-semibold text-zinc-900 mb-1">Map Your Columns</h2>
      {detectedName && (
        <div className="mb-4 flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm text-emerald-700">
          <CheckCircle2 size={16} />
          Detected format: <strong>{detectedName}</strong>. Column mapping auto-populated.
        </div>
      )}
      <p className="text-sm text-zinc-500 mb-4">
        {isGlMode
          ? 'G&L report detected. Required: Date Sold, Total Proceeds, Adjusted Cost Basis, Quantity. Each row will be imported as a matched Buy + Sell lot.'
          : 'Assign each column to a field. Required: Date, Action, Symbol, Quantity, Price.'}
      </p>
      {isGlMode && (
        <div className="mb-4 flex items-center gap-3">
          <label className="text-sm font-medium text-zinc-700">Currency of report values:</label>
          <select
            value={glCurrency}
            onChange={(e) => setGlCurrency(e.target.value)}
            className="rounded border border-zinc-300 px-2 py-1 text-sm"
          >
            <option value="USD">USD — US Dollar</option>
            <option value="CAD">CAD — Canadian Dollar</option>
            <option value="GBP">GBP — British Pound</option>
            <option value="EUR">EUR — Euro</option>
            <option value="AUD">AUD — Australian Dollar</option>
            <option value="CHF">CHF — Swiss Franc</option>
          </select>
          {glCurrency !== 'CAD' && (
            <span className="text-xs text-blue-600">Exchange rates will be fetched automatically.</span>
          )}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-zinc-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-zinc-50">
              {rawData.headers.map((header, i) => (
                <th key={i} className="px-3 py-2 text-left font-medium text-zinc-600 min-w-[140px]">
                  <div className="mb-1 truncate" title={header}>{header}</div>
                  <select
                    value={assignments[i] ?? ''}
                    onChange={(e) =>
                      setAssignments((prev) => ({ ...prev, [i]: e.target.value }))
                    }
                    className={`w-full rounded border px-2 py-1 text-xs ${
                      assignments[i] ? 'border-blue-300 bg-blue-50' : 'border-zinc-300'
                    }`}
                  >
                    {FIELD_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {previewRows.map((row, i) => (
              <tr key={i} className="border-t border-zinc-100">
                {row.map((cell, j) => (
                  <td key={j} className="px-3 py-1.5 text-zinc-600 truncate max-w-[200px]" title={cell}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-2 text-xs text-zinc-400">
        Showing {previewRows.length} of {rawData.rows.length} rows
      </div>

      {missingFields.length > 0 && (
        <div className="mt-4 flex items-center gap-2 text-sm text-amber-600">
          <AlertTriangle size={16} />
          Missing required fields: {missingFields.join(', ')}
        </div>
      )}

      {errors.length > 0 && (
        <div className="mt-4 rounded-lg bg-red-50 border border-red-200 p-3">
          <p className="text-sm font-medium text-red-700 mb-2">
            {errors.length} row(s) had issues:
          </p>
          <ul className="text-xs text-red-600 space-y-1 max-h-40 overflow-y-auto">
            {errors.slice(0, 10).map((err, i) => (
              <li key={i}>
                Row {err.row}: {err.message} ({err.field}: &quot;{err.value}&quot;)
              </li>
            ))}
            {errors.length > 10 && <li>...and {errors.length - 10} more</li>}
          </ul>
        </div>
      )}

      {fxStatus && (
        <div className="mt-4 flex items-center gap-2 text-sm text-blue-600">
          <Loader2 size={14} className="animate-spin" />
          {fxStatus}
        </div>
      )}

      <div className="mt-6 flex gap-3">
        <button
          onClick={() => setStep('import')}
          className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50 transition-colors"
        >
          Back
        </button>
        <button
          onClick={handleProcess}
          disabled={!mapping || processing}
          className="rounded-lg bg-zinc-900 px-6 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 transition-colors flex items-center gap-2"
        >
          {processing && <Loader2 size={14} className="animate-spin" />}
          Calculate Gains
        </button>
      </div>
    </div>
  );
}

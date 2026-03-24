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
      {/* Header */}
      <h2
        className="text-3xl font-extrabold tracking-tight text-primary mb-1"
        style={{ fontFamily: 'var(--font-display)' }}
      >
        Map Your Columns
      </h2>

      {/* Format detection banner */}
      {detectedName && (
        <div
          className="mb-4 flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium"
          style={{ background: '#d5e6e2', color: '#00261b', fontFamily: 'var(--font-display)' }}
        >
          <CheckCircle2 size={14} />
          Detected format: <strong>{detectedName}</strong>. Column mapping auto-populated.
        </div>
      )}

      <p className="text-sm text-secondary mb-5">
        {isGlMode
          ? 'G&L report mode — each row imports as a matched Buy + Sell lot. Required: Date Sold, Total Proceeds, Adjusted Cost Basis, Quantity.'
          : 'Assign each column to a field. Required: Date, Action, Symbol, Quantity, Price.'}
      </p>

      {/* G&L currency picker */}
      {isGlMode && (
        <div
          className="mb-5 flex items-center gap-3 rounded-lg px-4 py-3"
          style={{ background: '#f4f4f1' }}
        >
          <label
            className="text-xs font-bold uppercase tracking-wider text-secondary"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            Report currency
          </label>
          <select
            value={glCurrency}
            onChange={(e) => setGlCurrency(e.target.value)}
            className="rounded px-2 py-1 text-xs font-semibold text-on-surface outline-none"
            style={{ background: '#ffffff', border: '1px solid rgba(192,200,195,0.4)', fontFamily: 'var(--font-display)' }}
          >
            <option value="USD">USD — US Dollar</option>
            <option value="CAD">CAD — Canadian Dollar</option>
            <option value="GBP">GBP — British Pound</option>
            <option value="EUR">EUR — Euro</option>
            <option value="AUD">AUD — Australian Dollar</option>
            <option value="CHF">CHF — Swiss Franc</option>
          </select>
          {glCurrency !== 'CAD' && (
            <span className="text-xs text-secondary">Exchange rates fetched automatically from Bank of Canada.</span>
          )}
        </div>
      )}

      {/* Column mapping table */}
      <div
        className="overflow-x-auto rounded-lg"
        style={{ background: '#f4f4f1' }}
      >
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(192,200,195,0.2)' }}>
              {rawData.headers.map((header, i) => (
                <th
                  key={i}
                  className="px-3 py-3 text-left min-w-[140px]"
                >
                  <div
                    className="mb-1.5 truncate text-xs font-bold uppercase tracking-wider text-secondary"
                    style={{ fontFamily: 'var(--font-display)' }}
                    title={header}
                  >
                    {header}
                  </div>
                  <select
                    value={assignments[i] ?? ''}
                    onChange={(e) => setAssignments((prev) => ({ ...prev, [i]: e.target.value }))}
                    className="w-full rounded px-2 py-1 text-xs font-semibold outline-none transition-all"
                    style={{
                      fontFamily: 'var(--font-display)',
                      background: assignments[i] ? 'rgba(188,237,215,0.3)' : '#ffffff',
                      border: `1px solid ${assignments[i] ? '#00261b' : 'rgba(192,200,195,0.4)'}`,
                      color: assignments[i] ? '#00261b' : '#414944',
                    }}
                  >
                    {FIELD_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {previewRows.map((row, i) => (
              <tr
                key={i}
                style={{ borderTop: '1px solid rgba(192,200,195,0.12)', background: i % 2 === 0 ? '#f9f9f7' : '#f4f4f1' }}
              >
                {row.map((cell, j) => (
                  <td key={j} className="px-3 py-2 text-xs text-on-surface-variant truncate max-w-[200px]" title={cell}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-2 text-xs text-secondary">
        Showing {previewRows.length} of {rawData.rows.length} rows
      </div>

      {/* Missing fields warning — "Specimen Tag" style */}
      {missingFields.length > 0 && (
        <div className="mt-4 flex items-center gap-2 text-xs font-semibold" style={{ color: '#3a1411', fontFamily: 'var(--font-display)' }}>
          <AlertTriangle size={13} />
          Missing required fields:{' '}
          {missingFields.map((f) => (
            <span
              key={f}
              className="px-2 py-0.5 rounded"
              style={{ background: 'rgba(58,20,17,0.08)', color: '#3a1411' }}
            >
              {f}
            </span>
          ))}
        </div>
      )}

      {/* Row errors */}
      {errors.length > 0 && (
        <div className="mt-4 rounded-lg p-4" style={{ background: 'rgba(58,20,17,0.06)' }}>
          <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: '#3a1411', fontFamily: 'var(--font-display)' }}>
            {errors.length} row(s) had issues
          </p>
          <ul className="text-xs space-y-1 max-h-40 overflow-y-auto" style={{ color: '#3a1411' }}>
            {errors.slice(0, 10).map((err, i) => (
              <li key={i}>Row {err.row}: {err.message} ({err.field}: &quot;{err.value}&quot;)</li>
            ))}
            {errors.length > 10 && <li>…and {errors.length - 10} more</li>}
          </ul>
        </div>
      )}

      {/* FX fetch status */}
      {fxStatus && (
        <div className="mt-4 flex items-center gap-2 text-xs text-secondary">
          <Loader2 size={12} className="animate-spin" />
          {fxStatus}
        </div>
      )}

      {/* Actions */}
      <div className="mt-7 flex gap-3">
        <button
          onClick={() => setStep('import')}
          className="px-4 py-2 text-xs font-semibold text-on-surface-variant hover:text-primary transition-colors rounded"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          ← Back
        </button>
        <button
          onClick={handleProcess}
          disabled={!mapping || processing}
          className="btn-primary px-6 py-2 text-xs font-bold text-white rounded disabled:opacity-40 transition-all flex items-center gap-2"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          {processing && <Loader2 size={12} className="animate-spin" />}
          Calculate Gains
        </button>
      </div>
    </div>
  );
}

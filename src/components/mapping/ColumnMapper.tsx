'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { ColumnMapping, ImportedFile, Transaction, ValidationIssue } from '@/types';
import { suggestMapping } from '@/lib/mapping/auto-detect';
import { mapToTransactions, MappingError } from '@/lib/mapping/column-mapper';
import { fetchFxRates, lookupRate, getCachedRates } from '@/lib/engine/fx';
import { calculateGains } from '@/lib/engine/gains';
import { validateTransactions } from '@/lib/engine/validate-transactions';
import { formatDate, dateMin, dateMax } from '@/lib/date-utils';
import { matchKnownRenames } from '@/lib/constants/ticker-renames';
import { Loader2, AlertTriangle, CheckCircle2, FileSpreadsheet, ShieldAlert } from 'lucide-react';
import HoldingsChart from '../results/HoldingsChart';
import { ArrowRight } from 'lucide-react';

/**
 * Apply symbol aliases to transactions in-place (mutates).
 * Maps old ticker → new ticker for renamed stocks.
 */
function applySymbolAliases(transactions: Transaction[], aliases: Record<string, string>) {
  for (const txn of transactions) {
    if (aliases[txn.symbol]) {
      txn.symbol = aliases[txn.symbol];
    }
  }
}

/**
 * Auto-detect ticker renames by looking for symbols that stop appearing
 * while a new symbol starts appearing around the same time.
 * Returns a map of oldSymbol → newSymbol.
 */
function detectTickerRenames(transactions: Transaction[]): Record<string, string> {
  const sorted = [...transactions].sort(
    (a, b) => a.settlementDate.getTime() - b.settlementDate.getTime()
  );

  // Track first and last date each symbol appears
  const symbolRange = new Map<string, { first: Date; last: Date; count: number }>();
  for (const txn of sorted) {
    const existing = symbolRange.get(txn.symbol);
    if (!existing) {
      symbolRange.set(txn.symbol, { first: txn.settlementDate, last: txn.settlementDate, count: 1 });
    } else {
      existing.last = txn.settlementDate;
      existing.count++;
    }
  }

  const aliases: Record<string, string> = {};
  const symbols = [...symbolRange.entries()];

  // For each pair of symbols, check if one "ends" and the other "begins" within ~90 days
  for (let i = 0; i < symbols.length; i++) {
    for (let j = i + 1; j < symbols.length; j++) {
      const [symA, rangeA] = symbols[i];
      const [symB, rangeB] = symbols[j];

      const gapAB = rangeB.first.getTime() - rangeA.last.getTime();
      const gapBA = rangeA.first.getTime() - rangeB.last.getTime();
      const ninetyDays = 90 * 24 * 60 * 60 * 1000;

      // A ends before B starts (A is old ticker, B is new)
      // Threshold of 2 transactions accommodates G&L imports where each row
      // generates a synthetic BUY+SELL pair (so 1 G&L row = count 2).
      if (gapAB > 0 && gapAB < ninetyDays && rangeA.count >= 2 && rangeB.count >= 2) {
        aliases[symA] = symB;
      }
      // B ends before A starts (B is old ticker, A is new)
      else if (gapBA > 0 && gapBA < ninetyDays && rangeA.count >= 2 && rangeB.count >= 2) {
        aliases[symB] = symA;
      }
    }
  }

  return aliases;
}

const FIELD_OPTIONS = [
  { value: '', label: '-- Ignore --' },
  { value: 'date', label: 'Trade Date' },
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

// At least one date field (date or settlementDate) is required — checked separately
const REQUIRED_FIELDS = ['action', 'symbol', 'quantity', 'price'];
const DATE_FIELDS = ['date', 'settlementDate'];
const REQUIRED_FIELDS_GL = ['dateSold', 'totalProceeds', 'acbTotal', 'quantity'];

// ─── Per-file mapping panel ──────────────────────────────────
function FileMappingPanel({
  file,
  onMappingChange,
  onCurrencyChange,
}: {
  file: ImportedFile;
  onMappingChange: (assignments: Record<number, string>, isGl: boolean, currency: string) => void;
  onCurrencyChange: (currency: string) => void;
}) {
  const [assignments, setAssignments] = useState<Record<number, string>>({});
  const [isGlMode, setIsGlMode] = useState(false);
  const [isBenefitHistory, setIsBenefitHistory] = useState(false);
  const [glCurrency, setGlCurrency] = useState(file.currencyOverride || 'USD');

  useEffect(() => {
    if (file.detectedFormat === 'E*Trade Benefit History') {
      setIsBenefitHistory(true);
      setIsGlMode(false);
      // No column mapping needed for BenefitHistory — it's auto-parsed
      return;
    }

    if (file.mapping) {
      const gl = file.mapping.glMode === true;
      setIsGlMode(gl);
      // Reconstruct assignments from detected mapping
      const auto: Record<number, string> = {};
      const m = file.mapping;
      if (gl) {
        if (m.dateSold !== undefined && m.dateSold >= 0) auto[m.dateSold] = 'dateSold';
        if (m.dateAcquired !== undefined && m.dateAcquired >= 0) auto[m.dateAcquired] = 'dateAcquired';
        if (m.totalProceeds !== undefined && m.totalProceeds >= 0) auto[m.totalProceeds] = 'totalProceeds';
        if (m.acbTotal !== undefined && m.acbTotal >= 0) auto[m.acbTotal] = 'acbTotal';
        if (m.quantity >= 0) auto[m.quantity] = 'quantity';
        if (m.symbol !== undefined && m.symbol >= 0) auto[m.symbol] = 'symbol';
      } else {
        if (m.date >= 0) auto[m.date] = 'date';
        if (m.settlementDate !== undefined && m.settlementDate >= 0) auto[m.settlementDate] = 'settlementDate';
        if (m.action !== undefined && m.action >= 0) auto[m.action] = 'action';
        if (m.symbol !== undefined && m.symbol >= 0) auto[m.symbol] = 'symbol';
        if (m.quantity >= 0) auto[m.quantity] = 'quantity';
        if (m.price !== undefined && m.price >= 0) auto[m.price] = 'price';
        if (m.commission !== undefined && m.commission >= 0) auto[m.commission] = 'commission';
        if (m.currency !== undefined && m.currency >= 0) auto[m.currency] = 'currency';
      }
      setAssignments(auto);
    } else {
      // Try to suggest mapping
      const suggestion = suggestMapping(file.rawData.headers);
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
  }, [file]);

  useEffect(() => {
    onMappingChange(assignments, isGlMode, glCurrency);
  }, [assignments, isGlMode, glCurrency]);

  // BenefitHistory files are auto-parsed — just show a summary
  if (isBenefitHistory) {
    return (
      <div className="py-6 text-center">
        <CheckCircle2 size={28} className="mx-auto mb-3" style={{ color: 'var(--color-primary)' }} />
        <p className="text-sm font-semibold text-on-surface">
          Auto-detected: <strong>E*Trade Benefit History</strong>
        </p>
        <p className="text-xs text-secondary mt-1">
          RSU vest events and ESPP purchases will be extracted automatically.
        </p>
        <div className="mt-4 flex items-center justify-center gap-3">
          <label className="text-xs font-bold uppercase tracking-wider text-secondary" style={{ fontFamily: 'var(--font-display)' }}>
            Currency
          </label>
          <select
            value={glCurrency}
            onChange={(e) => { setGlCurrency(e.target.value); onCurrencyChange(e.target.value); }}
            className="rounded px-2 py-1 text-xs font-semibold outline-none"
            style={{
              background: 'var(--color-surface-lowest)',
              border: `1px solid rgba(var(--color-outline-variant-raw), 0.4)`,
              fontFamily: 'var(--font-display)',
            }}
          >
            <option value="USD">USD</option>
            <option value="CAD">CAD</option>
          </select>
        </div>
      </div>
    );
  }

  const assignedFields = Object.values(assignments).filter(Boolean);
  const required = isGlMode ? REQUIRED_FIELDS_GL : REQUIRED_FIELDS;
  const hasDate = DATE_FIELDS.some((f) => assignedFields.includes(f));
  const missingFields = [
    ...required.filter((f) => !assignedFields.includes(f)),
    ...(!isGlMode && !hasDate ? ['date or settlementDate'] : []),
  ];
  const previewRows = file.rawData.rows.slice(0, 4);

  return (
    <div>
      {file.detectedFormat && (
        <div
          className="mb-3 flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium"
          style={{
            background: 'var(--color-secondary-container)',
            color: 'var(--color-primary)',
            fontFamily: 'var(--font-display)',
          }}
        >
          <CheckCircle2 size={12} />
          Detected: <strong>{file.detectedFormat}</strong>
        </div>
      )}

      <p className="text-xs text-secondary mb-3">
        {isGlMode
          ? 'G&L report mode — assign Date Sold, Total Proceeds, ACB, Quantity.'
          : 'Assign each column to a field. Required: Date, Action, Symbol, Quantity, Price.'}
      </p>

      {/* Currency picker for G&L mode */}
      {isGlMode && (
        <div className="mb-3 flex items-center gap-3 rounded-lg px-3 py-2" style={{ background: 'var(--color-surface-low)' }}>
          <label className="text-xs font-bold uppercase tracking-wider text-secondary" style={{ fontFamily: 'var(--font-display)' }}>
            Currency
          </label>
          <select
            value={glCurrency}
            onChange={(e) => { setGlCurrency(e.target.value); onCurrencyChange(e.target.value); }}
            className="rounded px-2 py-1 text-xs font-semibold outline-none"
            style={{
              background: 'var(--color-surface-lowest)',
              border: `1px solid rgba(var(--color-outline-variant-raw), 0.4)`,
              fontFamily: 'var(--font-display)',
            }}
          >
            <option value="USD">USD — US Dollar</option>
            <option value="CAD">CAD — Canadian Dollar</option>
            <option value="GBP">GBP — British Pound</option>
            <option value="EUR">EUR — Euro</option>
          </select>
        </div>
      )}

      {/* Column mapping table */}
      <div className="overflow-x-auto rounded-lg custom-scrollbar pb-2" style={{ background: 'var(--color-surface-low)' }}>
        <table className="w-full text-sm min-w-max">
          <thead>
            <tr style={{ borderBottom: `1px solid rgba(var(--color-outline-variant-raw), 0.2)` }}>
              {file.rawData.headers.map((header, i) => (
                <th key={i} className="px-3 py-2 text-left min-w-[130px]">
                  <div
                    className="mb-1 truncate text-xs font-bold uppercase tracking-wider text-secondary"
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
                      background: assignments[i] ? `rgba(var(--color-primary-fixed-raw), 0.2)` : 'var(--color-surface-lowest)',
                      border: `1px solid ${assignments[i] ? 'var(--color-primary)' : `rgba(var(--color-outline-variant-raw), 0.4)`}`,
                      color: assignments[i] ? 'var(--color-primary)' : 'var(--color-on-surface-variant)',
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
                style={{
                  borderTop: `1px solid rgba(var(--color-outline-variant-raw), 0.12)`,
                  background: i % 2 === 0 ? 'var(--color-surface)' : 'var(--color-surface-low)',
                }}
              >
                {row.map((cell, j) => (
                  <td key={j} className="px-3 py-1.5 text-xs text-on-surface-variant truncate max-w-[180px]" title={cell}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-1 text-xs text-secondary">
        Showing {previewRows.length} of {file.rawData.rows.length} rows
      </div>

      {missingFields.length > 0 && (
        <div className="mt-3 flex items-center gap-2 text-xs font-semibold" style={{ color: 'var(--color-loss)', fontFamily: 'var(--font-display)' }}>
          <AlertTriangle size={12} />
          Missing: {missingFields.join(', ')}
        </div>
      )}
    </div>
  );
}

// ─── Main ColumnMapper ───────────────────────────────────────
export default function ColumnMapper() {
  const currentStep = useAppStore((s) => s.currentStep);
  const transactions = useAppStore((s) => s.transactions);
  const importedFiles = useAppStore((s) => s.importedFiles);
  const updateFileMapping = useAppStore((s) => s.updateFileMapping);
  const updateFileCurrency = useAppStore((s) => s.updateFileCurrency);
  const setTransactions = useAppStore((s) => s.setTransactions);
  const setResults = useAppStore((s) => s.setResults);
  const setStep = useAppStore((s) => s.setStep);
  const symbolAliases = useAppStore((s) => s.symbolAliases);
  const setSymbolAliases = useAppStore((s) => s.setSymbolAliases);

  const [suggestedAliases, setSuggestedAliases] = useState<Record<string, string>>({});

  const [fileMappingState, setFileMappingState] = useState<
    Map<string, { assignments: Record<number, string>; isGl: boolean; currency: string }>
  >(new Map());
  const [errors, setErrors] = useState<MappingError[]>([]);
  const [validationIssues, setValidationIssues] = useState<ValidationIssue[]>([]);
  const [processing, setProcessing] = useState(false);
  const [fxStatus, setFxStatus] = useState<string | null>(null);

  const handleMappingChange = useCallback((fileId: string, assignments: Record<number, string>, isGl: boolean, currency: string) => {
    setFileMappingState((prev) => {
      const next = new Map(prev);
      next.set(fileId, { assignments, isGl, currency });
      return next;
    });
  }, []);

  const handleCurrencyChange = useCallback((fileId: string, currency: string) => {
    updateFileCurrency(fileId, currency);
  }, [updateFileCurrency]);

  // Build ColumnMapping from assignments
  const buildMapping = useCallback((assignments: Record<number, string>, isGl: boolean, currency: string): ColumnMapping | null => {
    const reverse: Record<string, number> = {};
    for (const [colIdx, field] of Object.entries(assignments)) {
      if (field) reverse[field] = parseInt(colIdx);
    }

    if (isGl) {
      if (reverse.dateSold === undefined || reverse.totalProceeds === undefined ||
          reverse.acbTotal === undefined || reverse.quantity === undefined) return null;
      return {
        date: reverse.dateSold,
        quantity: reverse.quantity,
        glMode: true,
        glCurrency: currency,
        dateSold: reverse.dateSold,
        dateAcquired: reverse.dateAcquired,
        totalProceeds: reverse.totalProceeds,
        acbTotal: reverse.acbTotal,
        symbol: reverse.symbol,
      };
    }

    // Need at least one date column and quantity
    if (reverse.date === undefined && reverse.settlementDate === undefined) return null;
    if (reverse.quantity === undefined) return null;

    // If only one date column is mapped, use it as settlement date (primary)
    const hasSettlement = reverse.settlementDate !== undefined;
    const hasTradeDate = reverse.date !== undefined;

    return {
      date: hasTradeDate ? reverse.date! : reverse.settlementDate!,
      quantity: reverse.quantity,
      action: reverse.action,
      symbol: reverse.symbol,
      price: reverse.price,
      commission: reverse.commission,
      currency: reverse.currency,
      settlementDate: hasSettlement ? reverse.settlementDate : undefined,
      totalAmount: reverse.totalAmount,
    };
  }, []);

  const isFileValid = useCallback((fileId: string) => {
    const file = importedFiles.find((f) => f.id === fileId);
    if (!file) return false;
    if (file.detectedFormat === 'E*Trade Benefit History') return true;

    const state = fileMappingState.get(fileId);
    if (!state) return false;

    const assignedFields = Object.values(state.assignments).filter(Boolean);
    const required = state.isGl ? REQUIRED_FIELDS_GL : REQUIRED_FIELDS;
    const hasDate = state.isGl || DATE_FIELDS.some((f) => assignedFields.includes(f));
    return required.every((f) => assignedFields.includes(f)) && hasDate;
  }, [importedFiles, fileMappingState]);

  const allFilesValid = importedFiles.every(f => isFileValid(f.id));

  const handleProcess = async () => {
    setProcessing(true);
    setErrors([]);
    setValidationIssues([]);
    setFxStatus(null);

    try {
      let allTransactions: Transaction[] = [];
      const allErrors: MappingError[] = [];

      for (const file of importedFiles) {
        let mapping: ColumnMapping | null = null;

        if (file.detectedFormat === 'E*Trade Benefit History') {
          // Use benefitHistoryMode mapping
          mapping = {
            date: -1,
            quantity: -1,
            benefitHistoryMode: true,
            glCurrency: file.currencyOverride || 'USD',
          };
        } else {
          const state = fileMappingState.get(file.id);
          if (!state) continue;
          mapping = buildMapping(state.assignments, state.isGl, state.currency);
        }

        if (!mapping) {
          allErrors.push({
            row: 0,
            field: 'general',
            value: file.name,
            message: `Missing required column mapping for ${file.name}`,
          });
          continue;
        }

        updateFileMapping(file.id, mapping);
        const { transactions, errors: mapErrors } = mapToTransactions(file.rawData, mapping);

        // Tag transactions with source file
        for (const txn of transactions) {
          txn.sourceFileId = file.id;
        }

        allTransactions.push(...transactions);
        allErrors.push(...mapErrors.map((e) => ({ ...e, message: `[${file.name}] ${e.message}` })));
      }

      // ── Deduplicate transactions (same tx may appear in multiple PDFs) ──
      {
        const seen = new Set<string>();
        allTransactions = allTransactions.filter((t) => {
          const key = [
            t.tradeDate?.toISOString().slice(0, 10) ?? '',
            t.settlementDate.toISOString().slice(0, 10),
            t.action,
            t.symbol,
            t.quantity,
            Math.round(t.pricePerShare * 100),
          ].join('|');
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      }

      setErrors(allErrors);

      if (allErrors.length > 0 || allTransactions.length === 0) {
        setProcessing(false);
        return;
      }

      // ── Auto-detect ticker renames ────────────────────────
      // Merge heuristic detection with known renames (SQ→XYZ, FB→META, etc.)
      const detected = detectTickerRenames(allTransactions);
      const allSymbols = new Set(allTransactions.map((t) => t.symbol));
      const knownMatches = matchKnownRenames(allSymbols);
      const combinedDetected = { ...detected, ...knownMatches };

      if (Object.keys(combinedDetected).length > 0) {
        setSuggestedAliases(combinedDetected);
        // Auto-apply detected renames
        const merged = { ...symbolAliases, ...combinedDetected };
        setSymbolAliases(merged);
        applySymbolAliases(allTransactions, merged);
      } else if (Object.keys(symbolAliases).length > 0) {
        applySymbolAliases(allTransactions, symbolAliases);
      }

      // ── FX conversion ────────────────────────────────────
      const foreignTxns = allTransactions.filter((t) => t.currency !== 'CAD');
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

      // ── Cross-reference FMV for BenefitHistory BUYs with $0 price ──
      // Find FMV from G&L-sourced BUY transactions
      const fmvByDate = new Map<string, number>();
      const glBuysByDate = new Map<string, number>();
      for (const txn of allTransactions) {
        if (txn.action === 'BUY' && txn.pricePerShareCAD > 0) {
          const key = formatDate(txn.settlementDate, 'yyyy-MM-dd');
          if (!fmvByDate.has(key)) {
            fmvByDate.set(key, txn.pricePerShareCAD);
          }
          glBuysByDate.set(key, (glBuysByDate.get(key) || 0) + txn.quantity);
        }
      }

      // Apply FMV to zero-price BUYs (from BenefitHistory) and deduplicate
      const bhBuys = allTransactions.filter(
        (t) => t.action === 'BUY' && t.pricePerShareCAD === 0
      );
      for (const txn of bhBuys) {
        const key = formatDate(txn.settlementDate, 'yyyy-MM-dd');
        let fmv = fmvByDate.get(key) || 0;
        if (fmv === 0) {
          // Look for closest earlier FMV
          const allDates = [...fmvByDate.entries()].sort();
          for (const [d, v] of allDates) {
            if (d <= key) fmv = v;
          }
        }
        txn.pricePerShare = fmv;
        txn.pricePerShareCAD = fmv;
        txn.totalCAD = txn.quantity * fmv;

        // Reduce quantity by shares already accounted for in G&L
        const glCount = glBuysByDate.get(key) || 0;
        if (glCount > 0) {
          const reduce = Math.min(txn.quantity, glCount);
          txn.quantity -= reduce;
          txn.totalCAD = txn.quantity * fmv;
          glBuysByDate.set(key, glCount - reduce);
        }
      }

      // Remove zero-quantity transactions after dedup
      allTransactions = allTransactions.filter((t) => t.quantity > 0);

      // Sort chronological
      allTransactions.sort((a, b) => a.settlementDate.getTime() - b.settlementDate.getTime());

      // ── Validate ─────────────────────────────────────────
      setFxStatus('Validating transactions...');
      const issues = validateTransactions(allTransactions);
      setValidationIssues(issues);

      setFxStatus(null);
      setTransactions(allTransactions);
      setStep('review');
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

  const handleCalculateGains = useCallback(() => {
    try {
      // Re-apply aliases in case user changed them on the review page
      if (Object.keys(symbolAliases).length > 0) {
        applySymbolAliases(transactions, symbolAliases);
      }
      const result = calculateGains(transactions);
      setResults(result.dispositions, result.superficialLosses, result.acbSnapshots);
    } catch (err) {
      alert('Failed to calculate gains: ' + (err instanceof Error ? err.message : 'Unknown error'));
    }
  }, [transactions, symbolAliases, setResults]);

  if (importedFiles.length === 0) return null;

  if (currentStep === 'review') {
    return (
      <div className="mx-auto max-w-4xl">
        <h2 className="text-3xl font-extrabold tracking-tight text-primary mb-1" style={{ fontFamily: 'var(--font-display)' }}>
          Review Merged Transactions
        </h2>
        <p className="text-sm text-secondary mb-6">
          Your files have been successfully merged. Review the transaction summary and any validation warnings below before calculating your capital gains.
        </p>

        {/* Validation issues banner */}
        {validationIssues.length > 0 && (
          <div className="mb-6 rounded-lg p-5" style={{ background: `rgba(var(--color-tertiary-raw), 0.06)` }}>
            <h3 className="text-sm font-bold uppercase tracking-wider mb-3 flex items-center gap-2" style={{ color: 'var(--color-loss)', fontFamily: 'var(--font-display)' }}>
              <ShieldAlert size={16} />
              {validationIssues.length} Validation Warning{validationIssues.length > 1 ? 's' : ''}
            </h3>
            <ul className="text-sm space-y-2" style={{ color: 'var(--color-loss)' }}>
              {validationIssues.map((issue, i) => (
                <li key={i} className="flex gap-2">
                  <span className="shrink-0 pt-0.5">{issue.type === 'error' ? '🔴' : '⚠️'}</span>
                  <span>{issue.message}</span>
                </li>
              ))}
            </ul>
            <p className="text-xs mt-4 opacity-80" style={{ color: 'var(--color-loss)' }}>
              You can proceed anyway, but double-check your uploaded files if you see a negative balance warning.
            </p>
          </div>
        )}

        {/* Symbol aliases (ticker renames) */}
        {(Object.keys(symbolAliases).length > 0 || Object.keys(suggestedAliases).length > 0) && (
          <div className="mb-6 rounded-lg p-5" style={{ background: 'rgba(var(--color-primary-fixed-raw), 0.06)', border: '1px solid rgba(var(--color-primary-fixed-raw), 0.2)' }}>
            <h3 className="text-sm font-bold uppercase tracking-wider mb-3 flex items-center gap-2 text-primary" style={{ fontFamily: 'var(--font-display)' }}>
              <ArrowRight size={16} />
              Ticker Renames Detected
            </h3>
            <p className="text-xs text-secondary mb-3">
              These symbols appear to be the same stock with a renamed ticker. Transactions will be merged under the new symbol for ACB calculation.
            </p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(symbolAliases).map(([oldSym, newSym]) => (
                <div key={oldSym} className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium" style={{ background: 'var(--color-surface)', border: '1px solid rgba(var(--color-outline-variant-raw), 0.3)' }}>
                  <span className="text-on-surface-variant">{oldSym}</span>
                  <ArrowRight size={14} className="text-primary" />
                  <span className="text-on-surface font-semibold">{newSym}</span>
                  <button
                    onClick={() => {
                      const next = { ...symbolAliases };
                      delete next[oldSym];
                      setSymbolAliases(next);
                      // Re-process to undo the alias
                      setStep('mapping');
                    }}
                    className="ml-1 text-xs text-secondary hover:text-on-surface transition-colors"
                    title="Remove this alias"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mb-6 rounded-xl overflow-hidden border" style={{ borderColor: 'rgba(var(--color-outline-variant-raw), 0.2)' }}>
          <HoldingsChart transactions={transactions} />
        </div>

        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="rounded-xl p-5" style={{ background: 'var(--color-surface-low)' }}>
            <p className="text-xs font-bold uppercase tracking-wider text-secondary mb-1" style={{ fontFamily: 'var(--font-display)' }}>Total Transactions</p>
            <p className="text-3xl font-light text-on-surface">{transactions.length}</p>
          </div>
          <div className="rounded-xl p-5" style={{ background: 'var(--color-surface-low)' }}>
            <p className="text-xs font-bold uppercase tracking-wider text-secondary mb-1" style={{ fontFamily: 'var(--font-display)' }}>Total Buys / Sells</p>
            <p className="text-3xl font-light text-on-surface">
              {transactions.filter(t => t.action === 'BUY').length} / {transactions.filter(t => t.action === 'SELL').length}
            </p>
          </div>
        </div>

        <div className="rounded-lg overflow-hidden flex flex-col max-h-[500px]" style={{ background: 'var(--color-surface-low)' }}>
          <div className="overflow-x-auto overflow-y-auto flex-1 custom-scrollbar">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10" style={{ background: 'var(--color-surface-low)', boxShadow: '0 1px 0 rgba(var(--color-outline-variant-raw), 0.2)' }}>
                <tr>
                  <th className="px-4 py-3 text-left font-bold text-secondary text-xs uppercase tracking-wider">Date</th>
                  <th className="px-4 py-3 text-left font-bold text-secondary text-xs uppercase tracking-wider">Action</th>
                  <th className="px-4 py-3 text-left font-bold text-secondary text-xs uppercase tracking-wider">Symbol</th>
                  <th className="px-4 py-3 text-right font-bold text-secondary text-xs uppercase tracking-wider">Quantity</th>
                  <th className="px-4 py-3 text-right font-bold text-secondary text-xs uppercase tracking-wider">Price (CAD)</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((txn, i) => (
                  <tr key={txn.id} style={{ borderTop: i === 0 ? 'none' : `1px solid rgba(var(--color-outline-variant-raw), 0.12)`, background: i % 2 === 0 ? 'var(--color-surface)' : 'transparent' }}>
                    <td className="px-4 py-2 text-on-surface-variant font-medium whitespace-nowrap">{formatDate(txn.settlementDate, 'yyyy-MM-dd')}</td>
                    <td className="px-4 py-2 whitespace-nowrap">
                      <span
                        className="px-2 py-0.5 rounded text-xs font-semibold"
                        style={{
                          background: txn.action === 'BUY' ? `rgba(var(--color-primary-fixed-raw), 0.15)` : `rgba(var(--color-tertiary-raw), 0.1)`,
                          color: txn.action === 'BUY' ? 'var(--color-primary)' : 'var(--color-loss)'
                        }}
                      >
                        {txn.action}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-on-surface font-semibold whitespace-nowrap">{txn.symbol}</td>
                    <td className="px-4 py-2 text-on-surface-variant text-right whitespace-nowrap">{txn.quantity.toFixed(4)}</td>
                    <td className="px-4 py-2 text-on-surface-variant text-right whitespace-nowrap">${txn.pricePerShareCAD.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 text-center text-xs text-secondary border-t" style={{ borderColor: `rgba(var(--color-outline-variant-raw), 0.12)` }}>
            Showing all {transactions.length} rows
          </div>
        </div>

        <div className="mt-8 flex justify-between">
          <button
            onClick={() => setStep('mapping')}
            className="px-6 py-2 text-sm font-semibold text-on-surface-variant hover:text-primary transition-colors rounded"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            ← Back to Mapping
          </button>
          <button
            onClick={handleCalculateGains}
            className="btn-primary px-8 py-3 text-sm font-bold text-white rounded transition-all shadow-md"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            Calculate Capital Gains
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl">
      <h2
        className="text-3xl font-extrabold tracking-tight text-primary mb-1"
        style={{ fontFamily: 'var(--font-display)' }}
      >
        Map Your Columns
      </h2>
      <p className="text-sm text-secondary mb-6">
        Each file needs its columns mapped to standard fields. Auto-detected formats are pre-populated.
      </p>

      <div className="flex flex-col md:flex-row gap-8 items-start">
        {/* Sidebar */}
        <div className="w-full md:w-1/3 flex flex-col gap-3 md:sticky md:top-6">
          <h3 className="text-xs font-bold uppercase tracking-wider text-secondary mb-1" style={{ fontFamily: 'var(--font-display)' }}>
            Imported Files ({importedFiles.length})
          </h3>
          {importedFiles.map((file) => {
            const valid = isFileValid(file.id);
            return (
              <div 
                key={`sidebar-${file.id}`} 
                className="p-3 rounded-lg flex items-center gap-3 transition-colors"
                style={{ 
                  background: valid ? 'rgba(var(--color-primary-fixed-raw), 0.05)' : 'var(--color-surface-low)',
                  border: `1px solid ${valid ? 'var(--color-primary)' : 'rgba(var(--color-outline-variant-raw), 0.4)'}`
                }}
              >
                {valid ? (
                  <CheckCircle2 size={18} className="text-primary shrink-0" />
                ) : (
                  <div className="w-[18px] h-[18px] rounded-full border-2 shrink-0 border-secondary opacity-50" />
                )}
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-on-surface truncate">{file.name}</p>
                  <p className="text-xs mt-0.5" style={{ color: valid ? 'var(--color-primary)' : 'var(--color-secondary)' }}>
                    {valid ? 'Mapping complete' : 'Mapping required'}
                  </p>
                </div>
              </div>
            );
          })}

          <div className="mt-4 flex flex-col gap-3">
            <button
              onClick={handleProcess}
              disabled={processing || !allFilesValid}
              className="btn-primary w-full py-3 text-sm font-bold text-white rounded disabled:opacity-40 transition-all flex items-center justify-center gap-2 shadow-md"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {processing && <Loader2 size={14} className="animate-spin" />}
              Merge &amp; Review →
            </button>
            <button
              onClick={() => setStep('import')}
              className="w-full py-2 text-xs font-semibold text-on-surface-variant hover:text-primary transition-colors rounded"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              ← Back to Import
            </button>
          </div>

          {/* Row errors map over */}
          {errors.length > 0 && (
            <div className="mt-2 rounded-lg p-4" style={{ background: `rgba(var(--color-tertiary-raw), 0.06)` }}>
              <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--color-loss)', fontFamily: 'var(--font-display)' }}>
                {errors.length} mapping error(s)
              </p>
              <ul className="text-xs space-y-1 max-h-32 overflow-y-auto" style={{ color: 'var(--color-loss)' }}>
                {errors.slice(0, 8).map((err, i) => (
                  <li key={i} className="truncate" title={`Row ${err.row}: ${err.message}`}>Row {err.row}: {err.message}</li>
                ))}
                {errors.length > 8 && <li>…and {errors.length - 8} more</li>}
              </ul>
            </div>
          )}

          {/* FX status */}
          {fxStatus && (
            <div className="mt-2 flex items-center gap-2 text-xs text-secondary">
              <Loader2 size={12} className="animate-spin" />
              {fxStatus}
            </div>
          )}
        </div>

        {/* Main Content (Stacked Panels) */}
        <div className="w-full md:w-2/3 flex flex-col gap-6">
          {importedFiles.map((file) => (
            <div 
              key={file.id} 
              className="p-5 rounded-xl transition-colors"
              style={{ 
                background: 'var(--color-surface)', 
                border: `1px solid rgba(var(--color-outline-variant-raw), 0.2)`,
                boxShadow: '0 4px 12px rgba(0,0,0,0.02)'
              }}
            >
              <div className="mb-4 flex items-center gap-3 border-b pb-3" style={{ borderColor: 'rgba(var(--color-outline-variant-raw), 0.1)' }}>
                <FileSpreadsheet size={18} className="text-primary" />
                <h4 className="text-lg font-bold text-on-surface flex-1 truncate">{file.name}</h4>
                {file.detectedFormat && (
                  <span className="px-2 py-1 rounded text-xs font-bold" style={{ background: `rgba(var(--color-primary-fixed-raw), 0.15)`, color: 'var(--color-primary)' }}>
                    {file.detectedFormat}
                  </span>
                )}
              </div>
              <FileMappingPanel
                file={file}
                onMappingChange={(a, gl, c) => handleMappingChange(file.id, a, gl, c)}
                onCurrencyChange={(c) => handleCurrencyChange(file.id, c)}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

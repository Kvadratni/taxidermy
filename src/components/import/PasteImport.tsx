'use client';

import { useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { parsePaste } from '@/lib/import/paste-parser';
import { detectFormat } from '@/lib/mapping/auto-detect';
import { v4 as uuidv4 } from 'uuid';

export default function PasteImport() {
  const addFile = useAppStore((s) => s.addFile);
  const [text, setText]   = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleParse = () => {
    if (!text.trim()) return;
    setError(null);
    try {
      const rawData = parsePaste(text);
      const detection = detectFormat(rawData.headers);

      addFile({
        id: uuidv4(),
        name: 'Pasted Data',
        rawData,
        detectedFormat: detection?.format ?? null,
        mapping: detection?.mapping ?? null,
        transactions: [],
        currencyOverride: 'USD',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse pasted data');
    }
  };

  return (
    <div>
      <label
        className="block text-xs font-semibold text-on-surface-variant mb-1 uppercase tracking-wider"
        style={{ fontFamily: 'var(--font-display)' }}
      >
        Paste your data
      </label>
      <p className="text-xs text-secondary mb-3">
        Copy rows from a spreadsheet (including headers) and paste below. Tab-separated values expected.
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={10}
        placeholder={"Date\tAction\tSymbol\tQuantity\tPrice\tCommission\n2025-01-15\tBuy\tAAPL\t100\t150.00\t9.99"}
        className="w-full rounded-lg px-3 py-2 text-sm font-mono transition-all outline-none"
        style={{
          background: 'var(--color-surface-lowest)',
          border: `1px solid rgba(var(--color-outline-variant-raw), 0.4)`,
          color: 'var(--color-on-surface)',
        }}
        onFocus={(e) => (e.currentTarget.style.background = `rgba(var(--color-primary-fixed-raw), 0.1)`)}
        onBlur={(e)  => (e.currentTarget.style.background = 'var(--color-surface-lowest)')}
      />
      <button
        onClick={handleParse}
        disabled={!text.trim()}
        className="mt-3 btn-primary px-5 py-2 text-xs font-bold text-white rounded disabled:opacity-40 transition-all"
        style={{ fontFamily: 'var(--font-display)' }}
      >
        Parse Data
      </button>

      {error && (
        <div
          className="mt-4 rounded-lg p-3 text-sm"
          style={{
            background: `rgba(var(--color-tertiary-raw), 0.06)`,
            color: 'var(--color-loss)',
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}

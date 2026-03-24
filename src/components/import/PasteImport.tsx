'use client';

import { useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { parsePaste } from '@/lib/import/paste-parser';

export default function PasteImport() {
  const setRawData = useAppStore((s) => s.setRawData);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleParse = () => {
    if (!text.trim()) return;
    setError(null);
    try {
      const data = parsePaste(text);
      setRawData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse pasted data');
    }
  };

  return (
    <div>
      <label className="block text-sm font-medium text-zinc-700 mb-2">
        Paste your data
      </label>
      <p className="text-xs text-zinc-500 mb-3">
        Copy rows from a spreadsheet (including headers) and paste below. Tab-separated values expected.
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={10}
        placeholder={"Date\tAction\tSymbol\tQuantity\tPrice\tCommission\n2025-01-15\tBuy\tAAPL\t100\t150.00\t9.99"}
        className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm font-mono focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
      <button
        onClick={handleParse}
        disabled={!text.trim()}
        className="mt-3 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 transition-colors"
      >
        Parse Data
      </button>

      {error && (
        <div className="mt-4 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          {error}
        </div>
      )}
    </div>
  );
}

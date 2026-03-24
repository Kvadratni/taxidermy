'use client';

import { useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { fetchGoogleSheet } from '@/lib/import/google-sheets';
import { Loader2 } from 'lucide-react';

export default function GoogleSheetsImport() {
  const setRawData = useAppStore((s) => s.setRawData);
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFetch = async () => {
    if (!url.trim()) return;
    setError(null);
    setLoading(true);
    try {
      const data = await fetchGoogleSheet(url.trim());
      setRawData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch Google Sheet');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <label className="block text-sm font-medium text-zinc-700 mb-2">
        Google Sheets URL
      </label>
      <p className="text-xs text-zinc-500 mb-3">
        The sheet must be shared as &quot;Anyone with the link can view&quot;.
      </p>
      <div className="flex gap-2">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://docs.google.com/spreadsheets/d/..."
          className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <button
          onClick={handleFetch}
          disabled={loading || !url.trim()}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 transition-colors flex items-center gap-2"
        >
          {loading && <Loader2 size={14} className="animate-spin" />}
          Fetch
        </button>
      </div>

      {error && (
        <div className="mt-4 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          {error}
        </div>
      )}
    </div>
  );
}

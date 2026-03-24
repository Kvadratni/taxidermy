'use client';

import { useState, useCallback } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { parseCsvFile } from '@/lib/import/csv-parser';
import { parseXlsxFile } from '@/lib/import/xlsx-parser';
import { FileSpreadsheet } from 'lucide-react';

export default function FileImport() {
  const setRawData  = useAppStore((s) => s.setRawData);
  const [dragging, setDragging] = useState(false);
  const [error, setError]       = useState<string | null>(null);

  const handleFile = useCallback(async (file: File) => {
    setError(null);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase();
      if (ext === 'csv') {
        setRawData(await parseCsvFile(file));
      } else if (ext === 'xlsx' || ext === 'xls') {
        setRawData(await parseXlsxFile(file));
      } else {
        setError('Unsupported file type. Please upload a .csv or .xlsx file.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse file');
    }
  }, [setRawData]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const onFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  return (
    <div>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className="relative rounded-lg p-14 text-center transition-all"
        style={{
          background: dragging
            ? `rgba(var(--color-primary-fixed-raw), 0.18)`
            : 'var(--color-surface)',
          border: `2px dashed ${dragging ? 'var(--color-primary)' : `rgba(var(--color-outline-variant-raw), 0.5)`}`,
        }}
      >
        <FileSpreadsheet
          className="mx-auto mb-4"
          size={36}
          style={{ color: dragging ? 'var(--color-primary)' : 'var(--color-outline-variant)' }}
        />
        <p className="text-sm font-medium text-on-surface">
          Drag and drop your file here, or{' '}
          <label
            className="cursor-pointer font-semibold underline underline-offset-2"
            style={{ color: 'var(--color-primary)' }}
          >
            browse
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={onFileChange}
              className="hidden"
            />
          </label>
        </p>
        <p className="mt-2 text-xs text-secondary">Supports CSV, XLSX, XLS</p>
      </div>

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

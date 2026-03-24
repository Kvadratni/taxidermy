'use client';

import { useState, useCallback } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { parseCsvFile } from '@/lib/import/csv-parser';
import { parseXlsxFile } from '@/lib/import/xlsx-parser';
import { Upload, FileSpreadsheet } from 'lucide-react';

export default function FileImport() {
  const setRawData = useAppStore((s) => s.setRawData);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = useCallback(
    async (file: File) => {
      setError(null);
      try {
        const ext = file.name.split('.').pop()?.toLowerCase();
        if (ext === 'csv') {
          const data = await parseCsvFile(file);
          setRawData(data);
        } else if (ext === 'xlsx' || ext === 'xls') {
          const data = await parseXlsxFile(file);
          setRawData(data);
        } else {
          setError('Unsupported file type. Please upload a .csv or .xlsx file.');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to parse file');
      }
    },
    [setRawData]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const onFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`relative rounded-xl border-2 border-dashed p-12 text-center transition-colors ${
          dragging
            ? 'border-blue-400 bg-blue-50'
            : 'border-zinc-300 hover:border-zinc-400'
        }`}
      >
        <FileSpreadsheet className="mx-auto mb-4 text-zinc-400" size={40} />
        <p className="text-sm font-medium text-zinc-700">
          Drag and drop your file here, or{' '}
          <label className="cursor-pointer text-blue-600 hover:text-blue-700 underline">
            browse
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={onFileChange}
              className="hidden"
            />
          </label>
        </p>
        <p className="mt-2 text-xs text-zinc-400">Supports CSV, XLSX, XLS</p>
      </div>

      {error && (
        <div className="mt-4 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          {error}
        </div>
      )}
    </div>
  );
}

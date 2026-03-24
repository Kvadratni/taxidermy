'use client';

import { useState, useCallback } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { parseCsvFile } from '@/lib/import/csv-parser';
import { parseXlsxFile } from '@/lib/import/xlsx-parser';
import { detectFormat } from '@/lib/mapping/auto-detect';
import { FileSpreadsheet, X, CheckCircle2, Plus } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

export default function FileImport() {
  const importedFiles = useAppStore((s) => s.importedFiles);
  const addFile = useAppStore((s) => s.addFile);
  const removeFile = useAppStore((s) => s.removeFile);
  const setStep = useAppStore((s) => s.setStep);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = useCallback(async (file: File) => {
    setError(null);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase();
      let rawData;
      if (ext === 'csv') {
        rawData = await parseCsvFile(file);
      } else if (ext === 'xlsx' || ext === 'xls') {
        rawData = await parseXlsxFile(file);
      } else {
        setError('Unsupported file type. Please upload a .csv or .xlsx file.');
        return;
      }

      const detection = detectFormat(rawData.headers);

      addFile({
        id: uuidv4(),
        name: file.name,
        rawData,
        detectedFormat: detection?.format ?? null,
        mapping: detection?.mapping ?? null,
        transactions: [],
        currencyOverride: 'USD',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse file');
    }
  }, [addFile]);

  const handleFiles = useCallback(async (files: FileList) => {
    for (let i = 0; i < files.length; i++) {
      await handleFile(files[i]);
    }
  }, [handleFile]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  }, [handleFiles]);

  const onFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(e.target.files);
      e.target.value = ''; // reset so same file can be added again
    }
  }, [handleFiles]);

  return (
    <div className="mx-auto max-w-3xl">
      <h2
        className="text-3xl font-extrabold tracking-tight text-primary mb-1"
        style={{ fontFamily: 'var(--font-display)' }}
      >
        Import Your Files
      </h2>
      <p className="text-sm text-secondary mb-5">
        Upload one or more transaction files. Each file will be mapped to a standard format and merged into one report.
      </p>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className="relative rounded-lg p-12 text-center transition-all"
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
          Drag and drop files here, or{' '}
          <label
            className="cursor-pointer font-semibold underline underline-offset-2"
            style={{ color: 'var(--color-primary)' }}
          >
            browse
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              multiple
              onChange={onFileChange}
              className="hidden"
            />
          </label>
        </p>
        <p className="mt-2 text-xs text-secondary">
          Supports CSV, XLSX — G&amp;L reports, benefit history, brokerage exports
        </p>
      </div>

      {/* File list */}
      {importedFiles.length > 0 && (
        <div className="mt-5 space-y-2">
          <p
            className="text-xs font-bold uppercase tracking-wider text-secondary mb-2"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            {importedFiles.length} file{importedFiles.length > 1 ? 's' : ''} uploaded
          </p>
          {importedFiles.map((f) => (
            <div
              key={f.id}
              className="flex items-center justify-between rounded-lg px-4 py-3"
              style={{ background: 'var(--color-surface-low)' }}
            >
              <div className="flex items-center gap-3 min-w-0">
                <FileSpreadsheet size={18} style={{ color: 'var(--color-primary)', flexShrink: 0 }} />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-on-surface truncate">{f.name}</p>
                  <p className="text-xs text-secondary">
                    {f.rawData.rows.length} rows
                    {f.detectedFormat && (
                      <>
                        {' · '}
                        <span
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-semibold"
                          style={{
                            background: `rgba(var(--color-primary-fixed-raw), 0.15)`,
                            color: 'var(--color-primary)',
                            fontFamily: 'var(--font-display)',
                          }}
                        >
                          <CheckCircle2 size={10} />
                          {f.detectedFormat}
                        </span>
                      </>
                    )}
                  </p>
                </div>
              </div>
              <button
                onClick={() => removeFile(f.id)}
                className="p-1.5 rounded-full hover:bg-red-100 transition-colors"
                title="Remove file"
              >
                <X size={14} style={{ color: 'var(--color-loss)' }} />
              </button>
            </div>
          ))}

          {/* Add more files */}
          <label
            className="flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 cursor-pointer transition-all text-xs font-semibold"
            style={{
              border: `1.5px dashed rgba(var(--color-outline-variant-raw), 0.3)`,
              color: 'var(--color-primary)',
              fontFamily: 'var(--font-display)',
            }}
          >
            <Plus size={14} />
            Add another file
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              multiple
              onChange={onFileChange}
              className="hidden"
            />
          </label>
        </div>
      )}

      {/* Error */}
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

      {/* Actions */}
      <div className="mt-7 flex justify-end">
        <button
          onClick={() => setStep('mapping')}
          disabled={importedFiles.length === 0}
          className="btn-primary px-6 py-2 text-xs font-bold text-white rounded disabled:opacity-40 transition-all"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          Continue to Mapping →
        </button>
      </div>
    </div>
  );
}

'use client';

import { useState, useCallback } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { parseCsvFile } from '@/lib/import/csv-parser';
import { parseXlsxFile } from '@/lib/import/xlsx-parser';
import { detectFormat } from '@/lib/mapping/auto-detect';
import { FileSpreadsheet, X, CheckCircle2, Plus, Loader2 } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { parsePdfBatch } from '@/lib/import/pdf-parser';
import { isAcbFormat, normalizeAcbData } from '@/lib/import/acb-normalizer';

export default function FileImport() {
  const importedFiles = useAppStore((s) => s.importedFiles);
  const addFile = useAppStore((s) => s.addFile);
  const removeFile = useAppStore((s) => s.removeFile);
  const setStep = useAppStore((s) => s.setStep);
  const [dragging, setDragging] = useState(false);
  const [parsingPdf, setParsingPdf] = useState(false);
  const [pdfProgress, setPdfProgress] = useState<{ done: number; total: number } | null>(null);
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
        setError('Unsupported file type. Please upload a .csv, .xlsx, or .pdf file.');
        return;
      }

      // Normalize ACB.ca exports (have preamble rows before transaction data)
      if (isAcbFormat(rawData)) {
        rawData = normalizeAcbData(rawData);
      }

      const detection = detectFormat(rawData.headers);

      addFile({
        id: uuidv4(),
        name: file.name,
        rawData,
        detectedFormat: detection?.format ?? null,
        mapping: detection?.mapping ?? null,
        transactions: [],
        currencyOverride: detection?.format === 'AdjustedCostBase.ca' ? 'USD' : 'CAD',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse file');
    }
  }, [addFile]);

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    const supportedExts = ['csv', 'xlsx', 'xls', 'pdf'];
    // Filter to only supported file types (silently ignore .DS_Store, etc.)
    const supported = fileArray.filter(f => {
      const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
      return supportedExts.includes(ext);
    });
    const pdfs = supported.filter(f => f.name.toLowerCase().endsWith('.pdf'));
    const regulars = supported.filter(f => !f.name.toLowerCase().endsWith('.pdf'));

    if (supported.length === 0 && fileArray.length > 0) {
      setError('No supported files found. Please upload .csv, .xlsx, or .pdf files.');
      return;
    }

    // Process regulars
    for (const file of regulars) {
      await handleFile(file);
    }

    // Process PDFs (client-side, no server API needed)
    if (pdfs.length > 0) {
      setParsingPdf(true);
      setPdfProgress({ done: 0, total: pdfs.length });
      try {
        const { transactions: pdfTxns, failures } = await parsePdfBatch(
          pdfs,
          (done, total) => setPdfProgress({ done, total }),
        );

        if (pdfTxns.length > 0) {
          const headers = ['Date', 'Settlement Date', 'Action', 'Symbol', 'Quantity', 'Price', 'Commission', 'Currency'];
          const rows = pdfTxns.map(r => [
            r.date,
            r.settlementDate || r.date, // RSU/ESPP have no separate settlement date
            r.action,
            r.symbol,
            r.quantity.toString(),
            r.price.toString(),
            r.commission.toString(),
            r.currency,
          ]);

          addFile({
            id: uuidv4(),
            name: `Trade Confirmations Batch (${pdfTxns.length} extracted)`,
            rawData: { headers, rows, source: 'pdf' },
            detectedFormat: 'PDF Trade Confirmations',
            mapping: {
              date: 0,
              settlementDate: 1,
              action: 2,
              symbol: 3,
              quantity: 4,
              price: 5,
              commission: 6,
              currency: 7,
            },
            transactions: [],
            currencyOverride: 'USD',
          });
        }

        if (failures.length > 0) {
          const top = failures.slice(0, 3).map(f => {
            let line = `• ${f.name}: ${f.reason}`;
            if (f.preview) line += `\n  Text: "${f.preview.substring(0, 200)}…"`;
            return line;
          }).join('\n');
          const more = failures.length > 3 ? `\n…and ${failures.length - 3} more` : '';
          setError(`${pdfTxns.length}/${pdfs.length} PDFs extracted successfully.\n${failures.length} failed:\n${top}${more}`);
        }

        if (pdfTxns.length === 0 && failures.length > 0) {
          setError(`Could not extract any trades. All ${pdfs.length} PDFs failed.\n${failures.slice(0, 5).map(f => `• ${f.name}: ${f.reason}`).join('\n')}`);
        }
      } catch (err) {
        setError('Failed processing PDF batch.');
      }
      setParsingPdf(false);
      setPdfProgress(null);
    }
  }, [handleFile, addFile]);

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
          Drag and drop files/folders here, or{' '}
          <label
            className="cursor-pointer font-semibold underline underline-offset-2 mx-1"
            style={{ color: 'var(--color-primary)' }}
          >
            browse files
            <input
              type="file"
              accept=".csv,.xlsx,.xls,.pdf"
              multiple
              onChange={onFileChange}
              className="hidden"
            />
          </label>
          or{' '}
          <label
            className="cursor-pointer font-semibold underline underline-offset-2 mx-1"
            style={{ color: 'var(--color-primary)' }}
          >
            browse folder
            <input
              type="file"
              /* @ts-expect-error webkitdirectory is non-standard but widely supported */
              webkitdirectory=""
              directory=""
              multiple
              onChange={onFileChange}
              className="hidden"
            />
          </label>
        </p>
        <p className="mt-2 text-xs text-secondary">
          Supports CSV, XLSX, and batches of individual Trade Confirmation PDFs
        </p>
      </div>

      {/* Loading overlay for PDFs */}
      {parsingPdf && (
        <div className="mt-5 rounded-lg p-5 flex items-center justify-center gap-3" style={{ background: 'var(--color-primary-container)', color: 'var(--color-on-primary-container)' }}>
          <Loader2 className="animate-spin" size={20} />
          <span className="text-sm font-semibold tracking-wide" style={{ fontFamily: 'var(--font-display)' }}>
            Extracting transactions from PDFs...{pdfProgress ? ` ${pdfProgress.done}/${pdfProgress.total}` : ''}
          </span>
        </div>
      )}

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
            whiteSpace: 'pre-wrap',
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

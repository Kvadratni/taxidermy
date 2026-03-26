'use client';

import { useAppStore } from '@/store/useAppStore';
import { useMemo, useState, useRef, useEffect } from 'react';
import { downloadCsv, downloadFullExcel, downloadAllYearsExcel } from '@/lib/export/csv-export';
import { downloadFullPdf } from '@/lib/export/pdf-generator';
import { estimateTax } from '@/lib/engine/tax-estimator';
import { FileText, FileSpreadsheet, Printer, Table, ChevronDown } from 'lucide-react';

const ghostBtn = 'flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-on-surface-variant hover:text-primary transition-colors rounded';

export default function ExportButtons() {
  const allDispositions    = useAppStore((s) => s.dispositions);
  const allTransactions    = useAppStore((s) => s.transactions);
  const acbSnapshots       = useAppStore((s) => s.acbSnapshots);
  const superficialLosses  = useAppStore((s) => s.superficialLosses);
  const taxYear            = useAppStore((s) => s.taxYear);
  const province           = useAppStore((s) => s.province);
  const [showCsvModal, setShowCsvModal] = useState(false);
  const [showExcelMenu, setShowExcelMenu] = useState(false);
  const excelMenuRef = useRef<HTMLDivElement>(null);

  const dispositions = useMemo(() => {
    return allDispositions.filter((d) => d.transaction.settlementDate.getFullYear() === taxYear);
  }, [allDispositions, taxYear]);

  const availableYears = useMemo(() => {
    const years = new Set(allDispositions.map(d => d.transaction.settlementDate.getFullYear()));
    return Array.from(years).sort();
  }, [allDispositions]);

  const hasMultipleYears = availableYears.length > 1;

  const net = dispositions.reduce((s, d) => s + d.allowedGainLoss, 0);

  // Close excel menu on outside click
  useEffect(() => {
    if (!showExcelMenu) return;
    const handler = (e: MouseEvent) => {
      if (excelMenuRef.current && !excelMenuRef.current.contains(e.target as Node)) {
        setShowExcelMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showExcelMenu]);

  if (dispositions.length === 0) return null;

  return (
    <>
      <div className="flex items-center gap-1">
        <button
          onClick={() => downloadFullPdf(
            dispositions,
            allTransactions,
            acbSnapshots,
            superficialLosses,
            estimateTax(Math.max(0, net), province),
            taxYear,
          )}
          className={ghostBtn}
          title="Full report: Tax Summary, Charts, Schedule 3, Securities, All Transactions (PDF)"
        >
          <FileText size={12} /> PDF
        </button>
        <button
          onClick={() => setShowCsvModal(true)}
          className={ghostBtn}
          title="Schedule 3 only (CSV)"
        >
          <FileSpreadsheet size={12} /> CSV
        </button>

        {/* Excel button with optional dropdown for multi-year */}
        <div className="relative" ref={excelMenuRef}>
          {hasMultipleYears ? (
            <button
              onClick={() => setShowExcelMenu(!showExcelMenu)}
              className={ghostBtn}
              title="Export Excel workbook"
            >
              <Table size={12} /> Excel <ChevronDown size={10} />
            </button>
          ) : (
            <button
              onClick={() => downloadFullExcel(dispositions, allTransactions, acbSnapshots, taxYear)}
              className={ghostBtn}
              title="Full workbook: Schedule 3 + Securities + All Transactions (Excel)"
            >
              <Table size={12} /> Excel
            </button>
          )}

          {showExcelMenu && (
            <div
              className="absolute right-0 top-full mt-1 z-50 rounded-lg py-1 min-w-[200px] shadow-lg"
              style={{
                background: 'var(--color-surface-lowest)',
                border: '1px solid rgba(var(--color-outline-variant-raw), 0.3)',
              }}
            >
              <button
                onClick={() => {
                  downloadFullExcel(dispositions, allTransactions, acbSnapshots, taxYear);
                  setShowExcelMenu(false);
                }}
                className="w-full text-left px-4 py-2 text-xs font-medium text-on-surface hover:text-primary transition-colors"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                {taxYear} only
                <span className="block text-[10px] text-secondary font-normal mt-0.5">
                  Schedule 3 + Securities + Transactions
                </span>
              </button>
              <button
                onClick={() => {
                  downloadAllYearsExcel(allDispositions, allTransactions, acbSnapshots);
                  setShowExcelMenu(false);
                }}
                className="w-full text-left px-4 py-2 text-xs font-medium text-on-surface hover:text-primary transition-colors"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                All years ({availableYears.join(', ')})
                <span className="block text-[10px] text-secondary font-normal mt-0.5">
                  Separate Schedule 3 sheet per year
                </span>
              </button>
            </div>
          )}
        </div>

        <button onClick={() => window.print()} className={ghostBtn}>
          <Printer size={12} /> Print
        </button>
      </div>

      {/* CSV scope confirmation modal */}
      {showCsvModal && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={() => setShowCsvModal(false)}
        >
          <div
            className="rounded-xl p-6 max-w-md mx-4 shadow-2xl"
            style={{ background: 'var(--color-surface)', border: '1px solid rgba(var(--color-outline-variant-raw), 0.3)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3
              className="text-lg font-bold text-primary mb-2"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              CSV Export — Schedule 3 Only
            </h3>
            <p className="text-sm text-secondary mb-4">
              The CSV file will only contain your <strong>Schedule 3 dispositions</strong> (capital gains and losses).
              It does not include your securities holdings or full transaction history.
            </p>
            <p className="text-sm text-secondary mb-5">
              For a complete export with all three sheets (Schedule 3, Securities, and All Transactions), use the <strong>Excel</strong> button instead.
            </p>
            <div className="flex items-center gap-3 justify-end">
              <button
                onClick={() => setShowCsvModal(false)}
                className="px-4 py-2 text-sm font-medium text-secondary hover:text-primary transition-colors rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  downloadCsv(dispositions);
                  setShowCsvModal(false);
                }}
                className="btn-primary px-4 py-2 text-sm font-bold rounded-lg transition-colors text-white"
              >
                Download CSV
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

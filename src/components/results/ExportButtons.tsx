'use client';

import { useAppStore } from '@/store/useAppStore';
import { useMemo, useState } from 'react';
import { downloadCsv, downloadFullExcel } from '@/lib/export/csv-export';
import { downloadFullPdf } from '@/lib/export/pdf-generator';
import { estimateTax } from '@/lib/engine/tax-estimator';
import { FileText, FileSpreadsheet, Printer, Table } from 'lucide-react';

const ghostBtn = 'flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-on-surface-variant hover:text-primary transition-colors rounded';

export default function ExportButtons() {
  const allDispositions    = useAppStore((s) => s.dispositions);
  const allTransactions    = useAppStore((s) => s.transactions);
  const acbSnapshots       = useAppStore((s) => s.acbSnapshots);
  const superficialLosses  = useAppStore((s) => s.superficialLosses);
  const taxYear            = useAppStore((s) => s.taxYear);
  const province           = useAppStore((s) => s.province);
  const [showCsvModal, setShowCsvModal] = useState(false);

  const dispositions = useMemo(() => {
    return allDispositions.filter((d) => d.transaction.settlementDate.getFullYear() === taxYear);
  }, [allDispositions, taxYear]);

  const net = dispositions.reduce((s, d) => s + d.allowedGainLoss, 0);

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
        <button
          onClick={() => downloadFullExcel(dispositions, allTransactions, acbSnapshots, taxYear)}
          className={ghostBtn}
          title="Full workbook: Schedule 3 + Securities + All Transactions (Excel)"
        >
          <Table size={12} /> Excel
        </button>
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

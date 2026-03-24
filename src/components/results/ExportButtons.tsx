'use client';

import { useAppStore } from '@/store/useAppStore';
import { downloadCsv } from '@/lib/export/csv-export';
import { downloadPdf } from '@/lib/export/pdf-generator';
import { estimateTax } from '@/lib/engine/tax-estimator';
import { FileText, FileSpreadsheet, Printer } from 'lucide-react';

const ghostBtn = 'flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-on-surface-variant hover:text-primary transition-colors rounded';

export default function ExportButtons() {
  const dispositions = useAppStore((s) => s.dispositions);
  const province     = useAppStore((s) => s.province);

  const net = dispositions.reduce((s, d) => s + d.allowedGainLoss, 0);

  if (dispositions.length === 0) return null;

  return (
    <div className="flex items-center gap-1">
      <button onClick={() => downloadPdf(dispositions, estimateTax(Math.max(0, net), province))} className={ghostBtn}>
        <FileText size={12} /> PDF
      </button>
      <button onClick={() => downloadCsv(dispositions)} className={ghostBtn}>
        <FileSpreadsheet size={12} /> CSV
      </button>
      <button onClick={() => window.print()} className={ghostBtn}>
        <Printer size={12} /> Print
      </button>
    </div>
  );
}

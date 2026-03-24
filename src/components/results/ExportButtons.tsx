'use client';

import { useAppStore } from '@/store/useAppStore';
import { downloadCsv } from '@/lib/export/csv-export';
import { downloadPdf } from '@/lib/export/pdf-generator';
import { estimateTax } from '@/lib/engine/tax-estimator';
import { FileText, FileSpreadsheet, Printer } from 'lucide-react';

export default function ExportButtons() {
  const dispositions = useAppStore((s) => s.dispositions);
  const province = useAppStore((s) => s.province);

  const totalGains = dispositions
    .filter((d) => d.allowedGainLoss > 0)
    .reduce((s, d) => s + d.allowedGainLoss, 0);
  const totalLosses = dispositions
    .filter((d) => d.allowedGainLoss < 0)
    .reduce((s, d) => s + d.allowedGainLoss, 0);
  const netGainLoss = totalGains + totalLosses;

  const handlePdf = () => {
    const taxEstimate = estimateTax(Math.max(0, netGainLoss), province);
    downloadPdf(dispositions, taxEstimate);
  };

  const handleCsv = () => {
    downloadCsv(dispositions);
  };

  const handlePrint = () => {
    window.print();
  };

  if (dispositions.length === 0) return null;

  return (
    <div className="flex gap-2">
      <button
        onClick={handlePdf}
        className="flex items-center gap-2 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50 transition-colors"
      >
        <FileText size={14} />
        Export PDF
      </button>
      <button
        onClick={handleCsv}
        className="flex items-center gap-2 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50 transition-colors"
      >
        <FileSpreadsheet size={14} />
        Export CSV
      </button>
      <button
        onClick={handlePrint}
        className="flex items-center gap-2 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50 transition-colors"
      >
        <Printer size={14} />
        Print
      </button>
    </div>
  );
}

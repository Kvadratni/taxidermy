'use client';

import { useAppStore } from '@/store/useAppStore';
import Schedule3Report from './Schedule3Report';
import TaxSummary from './TaxSummary';
import SuperficialLossDetails from './SuperficialLossDetails';
import ExportButtons from './ExportButtons';

export default function ResultsView() {
  const dispositions = useAppStore((s) => s.dispositions);
  const transactions = useAppStore((s) => s.transactions);
  const setStep = useAppStore((s) => s.setStep);

  return (
    <div className="space-y-8">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-zinc-900">Calculation Results</h2>
          <p className="text-sm text-zinc-500">
            {transactions.length} transactions → {dispositions.length} dispositions
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setStep('mapping')}
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50 transition-colors"
          >
            Back
          </button>
          <ExportButtons />
        </div>
      </div>

      {/* Tax summary */}
      <section className="rounded-xl border border-zinc-200 bg-white p-6">
        <TaxSummary />
      </section>

      {/* Schedule 3 */}
      <section className="rounded-xl border border-zinc-200 bg-white p-6">
        <Schedule3Report />
      </section>

      {/* Superficial loss details */}
      <section className="rounded-xl border border-zinc-200 bg-white p-6">
        <SuperficialLossDetails />
      </section>
    </div>
  );
}

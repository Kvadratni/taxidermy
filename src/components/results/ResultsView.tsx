'use client';

import { useAppStore } from '@/store/useAppStore';
import Schedule3Report from './Schedule3Report';
import TaxSummary from './TaxSummary';
import SuperficialLossDetails from './SuperficialLossDetails';
import ExportButtons from './ExportButtons';

export default function ResultsView() {
  const dispositions   = useAppStore((s) => s.dispositions);
  const transactions   = useAppStore((s) => s.transactions);
  const setStep        = useAppStore((s) => s.setStep);

  return (
    <div className="space-y-6">
      {/* Asymmetric header */}
      <div className="flex items-end justify-between">
        <div>
          <h2
            className="text-3xl font-extrabold tracking-tight text-primary leading-tight"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            Calculation Results
          </h2>
          <p className="text-xs text-secondary mt-1 uppercase tracking-wider" style={{ fontFamily: 'var(--font-display)' }}>
            {transactions.length} transactions &rarr; {dispositions.length} dispositions
          </p>
        </div>

        {/* Floating action group */}
        <div
          className="flex items-center gap-2 rounded-lg px-4 py-2"
          style={{ background: '#ffffff', boxShadow: '0 4px 16px rgba(15,30,28,0.08)' }}
        >
          <button
            onClick={() => setStep('mapping')}
            className="text-xs font-medium text-on-surface-variant hover:text-primary transition-colors px-2 py-1 rounded"
          >
            Back
          </button>
          <div className="w-px h-4" style={{ background: 'rgba(192,200,195,0.4)' }} />
          <ExportButtons />
        </div>
      </div>

      {/* Tax Summary — elevated */}
      <section
        className="rounded-lg p-7"
        style={{ background: '#ffffff', boxShadow: '0 12px 40px rgba(15,30,28,0.06)' }}
      >
        <TaxSummary />
      </section>

      {/* Schedule 3 */}
      <section
        className="rounded-lg p-7"
        style={{ background: '#ffffff', boxShadow: '0 12px 40px rgba(15,30,28,0.06)' }}
      >
        <Schedule3Report />
      </section>

      {/* Superficial loss details */}
      <section
        className="rounded-lg p-7"
        style={{ background: '#ffffff', boxShadow: '0 12px 40px rgba(15,30,28,0.06)' }}
      >
        <SuperficialLossDetails />
      </section>
    </div>
  );
}

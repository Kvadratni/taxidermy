'use client';

import { WizardStep } from '@/types';
import { useAppStore } from '@/store/useAppStore';
import { Upload, Columns3, CheckCircle2, BarChart3 } from 'lucide-react';

const STEPS: { key: WizardStep; label: string; icon: React.ElementType }[] = [
  { key: 'import',  label: 'Import Data',  icon: Upload },
  { key: 'mapping', label: 'Map Columns',  icon: Columns3 },
  { key: 'review',  label: 'Review',       icon: CheckCircle2 },
  { key: 'results', label: 'Results',      icon: BarChart3 },
];

const STEP_ORDER: WizardStep[] = ['import', 'mapping', 'review', 'results'];

export default function Stepper() {
  const currentStep = useAppStore((s) => s.currentStep);
  const currentIndex = STEP_ORDER.indexOf(currentStep);

  return (
    <nav className="mx-auto max-w-6xl px-6 py-5">
      <ol className="flex items-center gap-2">
        {STEPS.map((step, i) => {
          const isCurrent   = step.key === currentStep;
          const isCompleted = i < currentIndex;
          const Icon        = step.icon;

          return (
            <li key={step.key} className="flex items-center gap-2">
              {i > 0 && (
                <div
                  className="h-px w-8 transition-colors"
                  style={{ background: isCompleted ? '#bcedd7' : 'rgba(192,200,195,0.4)' }}
                />
              )}

              <div
                className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded transition-all"
                style={{
                  fontFamily: 'var(--font-display)',
                  ...(isCurrent
                    ? { background: 'linear-gradient(160deg,#00261b,#0b3d2e)', color: '#fff' }
                    : isCompleted
                    ? { background: '#d5e6e2', color: '#00261b' }
                    : { background: 'transparent', color: '#c0c8c3' }),
                }}
              >
                <Icon size={12} />
                <span className="hidden sm:inline">{step.label}</span>
              </div>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

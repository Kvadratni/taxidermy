'use client';

import { WizardStep } from '@/types';
import { useAppStore } from '@/store/useAppStore';
import { Upload, Columns3, CheckCircle2, BarChart3 } from 'lucide-react';

const STEPS: { key: WizardStep; label: string; icon: React.ElementType }[] = [
  { key: 'import', label: 'Import Data', icon: Upload },
  { key: 'mapping', label: 'Map Columns', icon: Columns3 },
  { key: 'review', label: 'Review', icon: CheckCircle2 },
  { key: 'results', label: 'Results', icon: BarChart3 },
];

const STEP_ORDER: WizardStep[] = ['import', 'mapping', 'review', 'results'];

export default function Stepper() {
  const currentStep = useAppStore((s) => s.currentStep);
  const currentIndex = STEP_ORDER.indexOf(currentStep);

  return (
    <nav className="mx-auto max-w-6xl px-6 py-4">
      <ol className="flex items-center gap-2">
        {STEPS.map((step, i) => {
          const isCurrent = step.key === currentStep;
          const isCompleted = i < currentIndex;
          const Icon = step.icon;

          return (
            <li key={step.key} className="flex items-center gap-2">
              {i > 0 && (
                <div
                  className={`h-px w-8 ${
                    isCompleted ? 'bg-emerald-500' : 'bg-zinc-200'
                  }`}
                />
              )}
              <div
                className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                  isCurrent
                    ? 'bg-zinc-900 text-white'
                    : isCompleted
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-zinc-100 text-zinc-400'
                }`}
              >
                <Icon size={14} />
                <span className="hidden sm:inline">{step.label}</span>
              </div>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

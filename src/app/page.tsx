'use client';

import Header from '@/components/layout/Header';
import Stepper from '@/components/ui/Stepper';
import ImportMethodTabs from '@/components/import/ImportMethodTabs';
import ColumnMapper from '@/components/mapping/ColumnMapper';
import ResultsView from '@/components/results/ResultsView';
import { useAppStore } from '@/store/useAppStore';

export default function Home() {
  const currentStep = useAppStore((s) => s.currentStep);

  return (
    <div className="min-h-screen flex flex-col bg-surface">
      <Header />
      <Stepper />

      <main className="flex-1 mx-auto w-full max-w-6xl px-6 py-10">
        {currentStep === 'import' && <ImportMethodTabs />}
        {(currentStep === 'mapping' || currentStep === 'review') && <ColumnMapper />}
        {currentStep === 'results' && <ResultsView />}
      </main>
    </div>
  );
}

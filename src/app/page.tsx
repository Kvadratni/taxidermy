'use client';

import { useEffect, useState } from 'react';
import Header from '@/components/layout/Header';
import Stepper from '@/components/ui/Stepper';
import ImportMethodTabs from '@/components/import/ImportMethodTabs';
import ColumnMapper from '@/components/mapping/ColumnMapper';
import ResultsView from '@/components/results/ResultsView';
import MathGuide from '@/components/layout/MathGuide';
import { useAppStore } from '@/store/useAppStore';

export default function Home() {
  const currentStep = useAppStore((s) => s.currentStep);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    // Wait for zustand persist to rehydrate from localStorage
    const unsub = useAppStore.persist.onFinishHydration(() => setHydrated(true));
    // If already hydrated (e.g. no storage), set immediately
    if (useAppStore.persist.hasHydrated()) setHydrated(true);
    return unsub;
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-surface">
      <Header />
      <Stepper />

      <main className="flex-1 mx-auto w-full max-w-6xl px-6 py-10">
        {!hydrated ? (
          <div className="flex items-center justify-center py-20 text-secondary text-sm">
            Loading...
          </div>
        ) : (
          <>
            {currentStep === 'import' && <ImportMethodTabs />}
            {(currentStep === 'mapping' || currentStep === 'review') && <ColumnMapper />}
            {currentStep === 'results' && <ResultsView />}
          </>
        )}
      </main>

      <footer className="mx-auto w-full max-w-6xl px-6">
        <MathGuide />
      </footer>
    </div>
  );
}

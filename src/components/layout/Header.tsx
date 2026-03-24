'use client';

import { useAppStore } from '@/store/useAppStore';
import { RotateCcw } from 'lucide-react';

export default function Header() {
  const reset = useAppStore((s) => s.reset);

  return (
    <header className="border-b border-zinc-200 bg-white">
      <div className="mx-auto max-w-6xl flex items-center justify-between px-6 py-4">
        <div>
          <h1 className="text-xl font-bold text-zinc-900">Taxidermy</h1>
          <p className="text-sm text-zinc-500">Canadian Capital Gains Calculator</p>
        </div>
        <button
          onClick={reset}
          className="flex items-center gap-2 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50 transition-colors"
        >
          <RotateCcw size={14} />
          Start Over
        </button>
      </div>
    </header>
  );
}

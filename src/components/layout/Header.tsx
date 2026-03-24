'use client';

import { useAppStore } from '@/store/useAppStore';
import { useTheme } from '@/components/providers/ThemeProvider';
import { RotateCcw, Sun, Moon } from 'lucide-react';

export default function Header() {
  const reset = useAppStore((s) => s.reset);
  const { theme, toggleTheme } = useTheme();

  return (
    <header
      className="sticky top-0 z-50"
      style={{
        background: `rgba(var(--color-surface-raw), 0.88)`,
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderBottom: `1px solid rgba(var(--color-outline-variant-raw), 0.2)`,
      }}
    >
      <div className="mx-auto max-w-6xl flex items-center justify-between px-6 py-4">
        <div>
          <h1
            className="text-xl font-extrabold tracking-tight leading-none text-primary"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            Taxidermy
          </h1>
          <p
            className="text-xs text-secondary mt-0.5 tracking-widest uppercase"
            style={{ fontFamily: 'var(--font-sans)' }}
          >
            Canadian Capital Gains Calculator
          </p>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={toggleTheme}
            className="flex items-center justify-center w-8 h-8 rounded text-on-surface-variant hover:text-primary transition-colors"
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
          </button>
          <button
            onClick={reset}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-on-surface-variant hover:text-primary transition-colors rounded"
          >
            <RotateCcw size={12} />
            Start Over
          </button>
        </div>
      </div>
    </header>
  );
}

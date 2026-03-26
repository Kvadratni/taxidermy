'use client';

import { useAppStore } from '@/store/useAppStore';
import { useTheme } from '@/components/providers/ThemeProvider';
import { RotateCcw, Sun, Moon, Coffee, BookOpen } from 'lucide-react';

function GitHubIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
    </svg>
  );
}

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
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`${process.env.NEXT_PUBLIC_BASE_PATH || ''}/logo.png`} alt="Taxidermy logo" className="h-10 w-10" />
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
        </div>

        <div className="flex items-center gap-1">
          <a
            href="#how-it-works"
            onClick={(e) => {
              e.preventDefault();
              document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' });
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-on-surface-variant hover:text-primary transition-colors rounded"
          >
            <BookOpen size={12} />
            How it Works
          </a>
          <a
            href="https://ko-fi.com/maxnovich"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded transition-colors"
            style={{ background: 'rgba(var(--color-primary-fixed-raw), 0.1)', color: 'var(--color-primary)' }}
          >
            <Coffee size={12} />
            Buy me a coffee
          </a>
          <a
            href="https://github.com/Kvadratni/taxidermy"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center w-8 h-8 rounded text-on-surface-variant hover:text-primary transition-colors"
            aria-label="GitHub repository"
          >
            <GitHubIcon size={14} />
          </a>
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

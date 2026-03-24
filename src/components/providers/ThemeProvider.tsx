'use client';

import { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'light',
  toggleTheme: () => {},
});

// CSS variable overrides for dark mode
// (Tailwind v4/LightningCSS strips css-selector-based overrides at build time,
//  so we apply dark mode vars directly via JS on the root element.)
const DARK_VARS: [string, string][] = [
  ['--color-surface', '#141918'],
  ['--color-surface-dim', '#0f1312'],
  ['--color-surface-low', '#1b2120'],
  ['--color-surface-lowest', '#242b29'],
  ['--color-surface-high', '#222a28'],
  ['--color-surface-highest', '#2e3634'],
  ['--color-primary', '#bcedd7'],
  ['--color-primary-container', '#1a4030'],
  ['--color-primary-fixed', '#0d2821'],
  ['--color-secondary', '#8a9490'],
  ['--color-secondary-container', '#0a2318'],
  ['--color-tertiary', '#f87171'],
  ['--color-loss', '#f87171'],
  ['--color-loss-muted', '#fca5a5'],
  ['--color-on-surface', '#dde0de'],
  ['--color-on-surface-variant', '#9da6a2'],
  ['--color-outline-variant', '#3a4240'],
  // Raw RGB triplets for rgba() usage
  ['--color-surface-raw', '20, 25, 24'],
  ['--color-outline-variant-raw', '58, 66, 64'],
  ['--color-primary-fixed-raw', '188, 237, 215'],
  ['--color-tertiary-raw', '248, 113, 113'],
  ['--shadow-raw', '0, 0, 0'],
];

// CSS class overrides for rules that were inlined at build time
const DARK_CSS = `
  body { background: #141918 !important; color: #dde0de !important; }
  .btn-primary { background: linear-gradient(160deg, #1e5c3e 0%, #2a7854 100%) !important; }
  .btn-primary:hover { background: linear-gradient(160deg, #246b49 0%, #318a62 100%) !important; }
`;

function applyTheme(dark: boolean) {
  const root = document.documentElement;
  // Remove any previous overrides
  document.getElementById('theme-dark-overrides')?.remove();

  if (dark) {
    for (const [k, v] of DARK_VARS) {
      root.style.setProperty(k, v);
    }
    root.style.colorScheme = 'dark';
    // Inject CSS for rules that can't be handled by CSS vars alone
    const style = document.createElement('style');
    style.id = 'theme-dark-overrides';
    style.textContent = DARK_CSS;
    document.head.appendChild(style);
  } else {
    for (const [k] of DARK_VARS) {
      root.style.removeProperty(k);
    }
    root.style.colorScheme = 'light';
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>('light');

  useEffect(() => {
    // Sync state with what the inline script already applied
    const isDark = document.documentElement.classList.contains('dark');
    if (isDark) {
      applyTheme(true);
      setTheme('dark');
    }
  }, []);

  const toggleTheme = () => {
    const isDark = document.documentElement.classList.contains('dark');
    const next: Theme = isDark ? 'light' : 'dark';
    document.documentElement.classList.toggle('dark', next === 'dark');
    applyTheme(next === 'dark');
    localStorage.setItem('theme', next);
    setTheme(next);
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

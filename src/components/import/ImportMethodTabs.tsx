'use client';

import { useState } from 'react';
import FileImport from './FileImport';
import GoogleSheetsImport from './GoogleSheetsImport';
import PasteImport from './PasteImport';
import { Upload, Link, ClipboardPaste } from 'lucide-react';

type Tab = 'file' | 'sheets' | 'paste';

const TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
  { key: 'file',   label: 'Upload File',    icon: Upload },
  { key: 'sheets', label: 'Google Sheets',  icon: Link },
  { key: 'paste',  label: 'Paste Data',     icon: ClipboardPaste },
];

export default function ImportMethodTabs() {
  const [activeTab, setActiveTab] = useState<Tab>('file');

  return (
    <div className="mx-auto max-w-2xl">
      {/* Editorial heading */}
      <h2
        className="text-3xl font-extrabold tracking-tight text-primary mb-1 leading-tight"
        style={{ fontFamily: 'var(--font-display)' }}
      >
        Import Your Transactions
      </h2>
      <p className="text-sm text-secondary mb-8">
        Upload a CSV or Excel file, connect Google Sheets, or paste data directly.
      </p>

      {/* Tab switcher */}
      <div
        className="flex gap-1 p-1 mb-6 rounded-lg"
        style={{ background: '#e8e8e6' }}
      >
        {TABS.map((tab) => {
          const Icon    = tab.icon;
          const active  = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className="flex-1 flex items-center justify-center gap-2 rounded-md px-3 py-2 text-xs font-semibold transition-all"
              style={{
                fontFamily: 'var(--font-display)',
                ...(active
                  ? { background: '#ffffff', color: '#00261b', boxShadow: '0 2px 8px rgba(15,30,28,0.08)' }
                  : { background: 'transparent', color: '#414944' }),
              }}
            >
              <Icon size={14} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content — elevated card */}
      <div
        className="rounded-lg p-6"
        style={{ background: '#ffffff', boxShadow: '0 12px 40px rgba(15,30,28,0.06)' }}
      >
        {activeTab === 'file'   && <FileImport />}
        {activeTab === 'sheets' && <GoogleSheetsImport />}
        {activeTab === 'paste'  && <PasteImport />}
      </div>
    </div>
  );
}

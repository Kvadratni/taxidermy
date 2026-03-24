'use client';

import { useState } from 'react';
import FileImport from './FileImport';
import GoogleSheetsImport from './GoogleSheetsImport';
import PasteImport from './PasteImport';
import { Upload, Link, ClipboardPaste } from 'lucide-react';

type Tab = 'file' | 'sheets' | 'paste';

const TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
  { key: 'file', label: 'Upload File', icon: Upload },
  { key: 'sheets', label: 'Google Sheets', icon: Link },
  { key: 'paste', label: 'Paste Data', icon: ClipboardPaste },
];

export default function ImportMethodTabs() {
  const [activeTab, setActiveTab] = useState<Tab>('file');

  return (
    <div className="mx-auto max-w-3xl">
      <h2 className="text-lg font-semibold text-zinc-900 mb-1">Import Your Transactions</h2>
      <p className="text-sm text-zinc-500 mb-6">
        Upload a CSV or Excel file from your brokerage, paste from a Google Sheet, or enter a Google Sheets URL.
      </p>

      <div className="flex gap-1 rounded-lg bg-zinc-100 p-1 mb-6">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? 'bg-white text-zinc-900 shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-700'
              }`}
            >
              <Icon size={16} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === 'file' && <FileImport />}
      {activeTab === 'sheets' && <GoogleSheetsImport />}
      {activeTab === 'paste' && <PasteImport />}
    </div>
  );
}

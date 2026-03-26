'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  AppState,
  ImportedFile,
  ColumnMapping,
  Transaction,
  DispositionResult,
  SuperficialLossDetail,
  AcbRecord,
  WizardStep,
} from '@/types';

/**
 * Serialize state for localStorage.
 * Converts Date objects to ISO strings and Map to array of entries.
 */
function serialize(state: unknown): string {
  return JSON.stringify(state, (_key, value) => {
    if (value instanceof Date) return { __type: 'Date', value: value.toISOString() };
    if (value instanceof Map) return { __type: 'Map', value: [...value.entries()] };
    return value;
  });
}

/**
 * Deserialize state from localStorage.
 * Restores Date objects and Maps.
 */
const DATE_KEYS = new Set(['date', 'settlementDate']);
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

function deserialize(str: string): unknown {
  return JSON.parse(str, (key, value) => {
    if (value && typeof value === 'object' && value.__type === 'Date') return new Date(value.value);
    if (value && typeof value === 'object' && value.__type === 'Map') return new Map(value.value);
    // Fallback: restore ISO date strings on known date fields
    if (typeof value === 'string' && DATE_KEYS.has(key) && ISO_DATE_RE.test(value)) return new Date(value);
    return value;
  });
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      // Wizard
      currentStep: 'import',
      setStep: (step: WizardStep) => set({ currentStep: step }),

      // Multi-file import
      importedFiles: [],
      addFile: (file: ImportedFile) =>
        set((state) => ({ importedFiles: [...state.importedFiles, file] })),
      removeFile: (fileId: string) =>
        set((state) => ({
          importedFiles: state.importedFiles.filter((f) => f.id !== fileId),
        })),
      updateFileMapping: (fileId: string, mapping: ColumnMapping) =>
        set((state) => ({
          importedFiles: state.importedFiles.map((f) =>
            f.id === fileId ? { ...f, mapping } : f
          ),
        })),
      updateFileCurrency: (fileId: string, currency: string) =>
        set((state) => ({
          importedFiles: state.importedFiles.map((f) =>
            f.id === fileId ? { ...f, currencyOverride: currency } : f
          ),
        })),
      updateFileTransactions: (fileId: string, transactions: Transaction[]) =>
        set((state) => ({
          importedFiles: state.importedFiles.map((f) =>
            f.id === fileId ? { ...f, transactions } : f
          ),
        })),

      // Symbol aliases
      symbolAliases: {},
      setSymbolAliases: (aliases: Record<string, string>) => set({ symbolAliases: aliases }),

      // Merged transactions
      transactions: [],
      setTransactions: (txns: Transaction[]) => set({ transactions: txns }),

      // Results
      dispositions: [],
      superficialLosses: [],
      acbSnapshots: new Map<string, AcbRecord>(),
      setResults: (
        dispositions: DispositionResult[],
        superficialLosses: SuperficialLossDetail[],
        acbSnapshots: Map<string, AcbRecord>
      ) =>
        set({
          dispositions,
          superficialLosses,
          acbSnapshots,
          currentStep: 'results',
        }),

      // Settings
      province: 'BC',
      taxYear: 2025,
      setProvince: (code: string) => set({ province: code }),
      setTaxYear: (year: number) => set({ taxYear: year }),

      // UI (non-persisted)
      mathGuideOpen: false,
      setMathGuideOpen: (open: boolean) => set({ mathGuideOpen: open }),

      // Reset — clears persisted state too
      reset: () =>
        set({
          currentStep: 'import',
          importedFiles: [],
          symbolAliases: {},
          transactions: [],
          dispositions: [],
          superficialLosses: [],
          acbSnapshots: new Map(),
        }),
    }),
    {
      name: 'taxidermy-state',
      storage: {
        getItem: (name) => {
          const str = localStorage.getItem(name);
          if (!str) return null;
          return deserialize(str) as { state: AppState; version?: number };
        },
        setItem: (name, value) => {
          localStorage.setItem(name, serialize(value));
        },
        removeItem: (name) => {
          localStorage.removeItem(name);
        },
      },
      // Only persist data state, not setter functions
      partialize: (state) => ({
        currentStep: state.currentStep,
        importedFiles: state.importedFiles,
        symbolAliases: state.symbolAliases,
        transactions: state.transactions,
        dispositions: state.dispositions,
        superficialLosses: state.superficialLosses,
        acbSnapshots: state.acbSnapshots,
        province: state.province,
        taxYear: state.taxYear,
      }) as unknown as AppState,
    }
  )
);

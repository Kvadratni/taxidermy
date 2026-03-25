'use client';

import { create } from 'zustand';
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

export const useAppStore = create<AppState>((set) => ({
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

  // Reset
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
}));

'use client';

import { create } from 'zustand';
import {
  AppState,
  RawImportData,
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

  // Import
  rawData: null,
  setRawData: (data: RawImportData) => set({ rawData: data, currentStep: 'mapping' }),

  // Mapping
  columnMapping: null,
  detectedFormat: null,
  setColumnMapping: (mapping: ColumnMapping) => set({ columnMapping: mapping }),
  setDetectedFormat: (format: string | null) => set({ detectedFormat: format }),

  // Transactions
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
      rawData: null,
      columnMapping: null,
      detectedFormat: null,
      transactions: [],
      dispositions: [],
      superficialLosses: [],
      acbSnapshots: new Map(),
    }),
}));

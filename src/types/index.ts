export type TransactionAction = 'BUY' | 'SELL' | 'SPLIT' | 'ROC';

export interface RawImportData {
  headers: string[];
  rows: string[][];
  source: 'csv' | 'xlsx' | 'google-sheets' | 'paste';
}

export interface ColumnMapping {
  date: number;
  action?: number;
  symbol?: number;
  quantity: number;
  price?: number;
  commission?: number;
  currency?: number;
  totalAmount?: number;
  settlementDate?: number;
  // G&L (Gains & Losses) report mode — pre-matched lots with no action/symbol columns
  glMode?: boolean;
  glCurrency?: string;
  dateSold?: number;
  dateAcquired?: number;
  totalProceeds?: number;
  acbTotal?: number;
}

export interface Transaction {
  id: string;
  date: Date;
  settlementDate: Date;
  action: TransactionAction;
  symbol: string;
  quantity: number;
  pricePerShare: number;
  pricePerShareCAD: number;
  commission: number;
  currency: string;
  fxRate: number;
  totalCAD: number;
  splitRatio?: number;
  rocPerShare?: number;
  // Set on G&L-mode SELL transactions to preserve the original pre-FX ACB for display
  glOriginalAcb?: number;
}

export interface AcbRecord {
  symbol: string;
  totalShares: number;
  totalAcb: number;
  acbPerShare: number;
}

export interface DispositionResult {
  transaction: Transaction;
  proceeds: number;
  acbOfSharesSold: number;
  outlays: number;
  rawGainLoss: number;
  superficialLoss: number;
  allowedGainLoss: number;
  isSuperficialLoss: boolean;
  yearOfAcquisition: string;
}

export interface SuperficialLossDetail {
  dispositionId: string;
  sharesSold: number;
  sharesPurchasedInWindow: number;
  sharesHeldAfter: number;
  totalLoss: number;
  deniedLoss: number;
}

export interface TaxBracket {
  min: number;
  max: number | null;
  rate: number;
}

export interface TaxEstimate {
  province: string;
  totalCapitalGains: number;
  inclusionRate: number;
  taxableCapitalGains: number;
  federalTax: number;
  provincialTax: number;
  combinedTax: number;
  effectiveRate: number;
  bracketBreakdown: {
    level: 'federal' | 'provincial';
    bracket: TaxBracket;
    taxableInBracket: number;
    taxAtBracket: number;
  }[];
}

export interface FxRateCache {
  [currencyPair: string]: {
    [date: string]: number;
  };
}

export type WizardStep = 'import' | 'mapping' | 'review' | 'results';

export interface AppState {
  // Wizard
  currentStep: WizardStep;
  setStep: (step: WizardStep) => void;

  // Import
  rawData: RawImportData | null;
  setRawData: (data: RawImportData) => void;

  // Mapping
  columnMapping: ColumnMapping | null;
  detectedFormat: string | null;
  setColumnMapping: (mapping: ColumnMapping) => void;
  setDetectedFormat: (format: string | null) => void;

  // Transactions
  transactions: Transaction[];
  setTransactions: (txns: Transaction[]) => void;

  // Results
  dispositions: DispositionResult[];
  superficialLosses: SuperficialLossDetail[];
  acbSnapshots: Map<string, AcbRecord>;
  setResults: (
    dispositions: DispositionResult[],
    superficialLosses: SuperficialLossDetail[],
    acbSnapshots: Map<string, AcbRecord>
  ) => void;

  // Settings
  province: string;
  taxYear: number;
  setProvince: (code: string) => void;
  setTaxYear: (year: number) => void;

  // Reset
  reset: () => void;
}

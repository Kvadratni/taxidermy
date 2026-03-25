export type TransactionAction = 'BUY' | 'SELL' | 'SPLIT' | 'ROC';

export interface RawImportData {
  headers: string[];
  rows: string[][];
  source: 'csv' | 'xlsx' | 'google-sheets' | 'paste' | 'pdf';
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
  // Benefit History mode — vest/purchase events parsed via special parser
  benefitHistoryMode?: boolean;
}

export interface ImportedFile {
  id: string;
  name: string;
  rawData: RawImportData;
  detectedFormat: string | null;
  mapping: ColumnMapping | null;
  /** Mapped transactions produced from this file */
  transactions: Transaction[];
  /** Currency override for files without a currency column */
  currencyOverride: string;
}

export interface Transaction {
  id: string;
  settlementDate: Date;
  tradeDate?: Date;
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
  /** Source file ID for tracing back */
  sourceFileId?: string;
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

export interface ValidationIssue {
  type: 'error' | 'warning';
  symbol: string;
  date?: Date;
  message: string;
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

  // Multi-file import
  importedFiles: ImportedFile[];
  addFile: (file: ImportedFile) => void;
  removeFile: (fileId: string) => void;
  updateFileMapping: (fileId: string, mapping: ColumnMapping) => void;
  updateFileCurrency: (fileId: string, currency: string) => void;
  updateFileTransactions: (fileId: string, transactions: Transaction[]) => void;

  // Symbol aliases (ticker renames, e.g. SQ → XYZ)
  symbolAliases: Record<string, string>;
  setSymbolAliases: (aliases: Record<string, string>) => void;

  // Merged transactions (after all files are mapped and merged)
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

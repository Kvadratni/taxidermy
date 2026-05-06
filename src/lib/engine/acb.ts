import { Transaction, AcbRecord, DispositionResult } from '@/types';

export interface AcbState {
  records: Map<string, AcbRecord>;
}

export function createAcbState(): AcbState {
  return { records: new Map() };
}

export function getAcbRecord(state: AcbState, symbol: string): AcbRecord {
  return state.records.get(symbol) ?? {
    symbol,
    totalShares: 0,
    totalAcb: 0,
    acbPerShare: 0,
  };
}

function setAcbRecord(state: AcbState, record: AcbRecord): void {
  state.records.set(record.symbol, { ...record });
}

export function processBuy(state: AcbState, txn: Transaction): void {
  const rec = getAcbRecord(state, txn.symbol);
  const cost = txn.quantity * txn.pricePerShareCAD + txn.commission;
  rec.totalShares += txn.quantity;
  rec.totalAcb += cost;
  rec.acbPerShare = rec.totalShares > 0 ? rec.totalAcb / rec.totalShares : 0;
  setAcbRecord(state, rec);
}

export function processSell(
  state: AcbState,
  txn: Transaction
): DispositionResult {
  const rec = getAcbRecord(state, txn.symbol);
  const acbPerShare = rec.acbPerShare;
  const acbOfSharesSold = acbPerShare * txn.quantity;
  const proceeds = txn.quantity * txn.pricePerShareCAD;
  const outlays = txn.commission;
  const rawGainLoss = proceeds - acbOfSharesSold - outlays;

  // Update ACB state
  rec.totalShares -= txn.quantity;
  rec.totalAcb -= acbOfSharesSold;
  if (rec.totalShares <= 0) {
    rec.totalShares = 0;
    rec.totalAcb = 0;
  }
  rec.acbPerShare = rec.totalShares > 0 ? rec.totalAcb / rec.totalShares : 0;
  setAcbRecord(state, rec);

  return {
    transaction: txn,
    proceeds,
    acbOfSharesSold,
    outlays,
    rawGainLoss,
    superficialLoss: 0,
    allowedGainLoss: rawGainLoss,
    isSuperficialLoss: false,
    yearOfAcquisition: 'Various',
  };
}

export function processSplit(state: AcbState, txn: Transaction): void {
  const rec = getAcbRecord(state, txn.symbol);
  const ratio = txn.splitRatio ?? 2;
  rec.totalShares *= ratio;
  // ACB total stays the same, per-share adjusts
  rec.acbPerShare = rec.totalShares > 0 ? rec.totalAcb / rec.totalShares : 0;
  setAcbRecord(state, rec);
}

/**
 * Handle a split defined by a quantity delta (e.g. +100 shares) rather than a ratio.
 * Total cost basis remains unchanged.
 */
export function processSplitQuantity(state: AcbState, txn: Transaction): void {
  const rec = getAcbRecord(state, txn.symbol);
  rec.totalShares += txn.quantity;
  rec.acbPerShare = rec.totalShares > 0 ? rec.totalAcb / rec.totalShares : 0;
  setAcbRecord(state, rec);
}

export function processRoc(state: AcbState, txn: Transaction): void {
  const rec = getAcbRecord(state, txn.symbol);
  const rocAmount = (txn.rocPerShare ?? 0) * rec.totalShares;
  rec.totalAcb -= rocAmount;
  if (rec.totalAcb < 0) {
    // Excess ROC becomes a capital gain - tracked separately
    rec.totalAcb = 0;
  }
  rec.acbPerShare = rec.totalShares > 0 ? rec.totalAcb / rec.totalShares : 0;
  setAcbRecord(state, rec);
}

export function addToAcb(state: AcbState, symbol: string, amount: number): void {
  const rec = getAcbRecord(state, symbol);
  rec.totalAcb += amount;
  rec.acbPerShare = rec.totalShares > 0 ? rec.totalAcb / rec.totalShares : 0;
  setAcbRecord(state, rec);
}



/**
 * Known ticker renames — a static map of old ticker → new ticker.
 *
 * When both the old and new ticker appear in a user's transactions,
 * the old ticker is automatically aliased to the new one so ACB
 * tracking remains continuous across the rename.
 *
 * Add new entries as they happen. Format: [oldTicker, newTicker].
 */
export const KNOWN_TICKER_RENAMES: [string, string][] = [
  // US equities
  ['SQ', 'XYZ'],          // Block (formerly Square) — 2025
  ['FB', 'META'],         // Meta Platforms — 2022
  ['TWTR', 'X'],          // X Corp (formerly Twitter) — 2023
  ['OSTK', 'BYON'],       // Beyond Inc. (formerly Overstock) — 2023
  ['VIAC', 'PARA'],       // Paramount Global (formerly ViacomCBS) — 2022
  ['SGMS', 'LNW'],        // Light & Wonder (formerly Scientific Games) — 2022
  ['TOT', 'TTE'],         // TotalEnergies — 2021
  ['PCLN', 'BKNG'],       // Booking Holdings (formerly Priceline) — 2018
  ['TASR', 'AXON'],       // Axon Enterprise (formerly Taser) — 2017
  ['COH', 'TPR'],         // Tapestry (formerly Coach) — 2017
  ['KORS', 'CPRI'],       // Capri Holdings (formerly Michael Kors) — 2018
  ['WTW', 'WW'],          // WW International (formerly Weight Watchers) — 2018

  // Canadian equities
  ['WEED.TO', 'CGC.TO'],  // Canopy Growth — renamed
  ['ACB.TO', 'ACB'],      // Aurora Cannabis — moved exchanges
];

/**
 * Build a lookup of known renames that are relevant to the user's transactions.
 * Only returns aliases where BOTH the old and new ticker appear in the data.
 */
export function matchKnownRenames(symbols: Set<string>): Record<string, string> {
  const aliases: Record<string, string> = {};
  for (const [oldTicker, newTicker] of KNOWN_TICKER_RENAMES) {
    if (symbols.has(oldTicker) && symbols.has(newTicker)) {
      aliases[oldTicker] = newTicker;
    }
  }
  return aliases;
}

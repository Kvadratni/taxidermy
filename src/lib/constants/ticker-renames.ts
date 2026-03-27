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
  ['SQ', 'XYZ'],          // Block (formerly Square) — renamed June 2025
  ['FB', 'META'],         // Meta Platforms — renamed June 2022
  ['TWTR', 'X'],          // X Corp (formerly Twitter) — delisted/renamed 2023

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

/**
 * Local date utilities — replaces date-fns to reduce supply chain risk.
 * Only implements the subset used by this project.
 */

const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const MONTH_LOOKUP: Record<string, number> = {};
MONTHS_LONG.forEach((m, i) => { MONTH_LOOKUP[m.toLowerCase()] = i; });
MONTHS_SHORT.forEach((m, i) => { MONTH_LOOKUP[m.toLowerCase()] = i; });

// ── Formatting ──────────────────────────────────────────────────────────────

/**
 * Format a Date to a string.
 * Supported tokens: yyyy, MMMM, MMM, MM, dd, d
 */
export function formatDate(date: Date | string, pattern: string): string {
  if (typeof date === 'string') date = new Date(date);
  const y = date.getFullYear();
  const M = date.getMonth();
  const d = date.getDate();

  // Replace tokens in order of specificity (longest first)
  return pattern
    .replace('yyyy', String(y))
    .replace('MMMM', MONTHS_LONG[M])
    .replace('MMM', MONTHS_SHORT[M])
    .replace('MM', String(M + 1).padStart(2, '0'))
    .replace(/\bdd\b/, String(d).padStart(2, '0'))
    .replace(/\bd\b/, String(d));
}

// ── Parsing ─────────────────────────────────────────────────────────────────

/** Parse an ISO-ish date string (yyyy-MM-dd or yyyy-MM-ddTHH:mm:ss...). */
export function parseISO(value: string): Date {
  const d = new Date(value);
  return d;
}

/** Check if a Date is valid (not NaN). */
export function isValid(date: Date): boolean {
  return date instanceof Date && !isNaN(date.getTime());
}

/**
 * Parse a date string using a format pattern.
 * Supported patterns:
 *   yyyy-MM-dd, MM/dd/yyyy, dd/MM/yyyy, M/d/yyyy, yyyy/MM/dd,
 *   MMM dd, yyyy, MMMM dd, yyyy, MMM dd yyyy, MMMM dd yyyy,
 *   dd-MMM-yyyy, dd MMM yyyy, MM-dd-yyyy
 */
export function parseDate(value: string, pattern: string, _ref?: Date): Date {
  const s = value.trim();

  // Token map: pattern token → { placeholder, regex, group }
  // We use a single-pass approach to avoid chained .replace() corrupting
  // previously-inserted capture groups (e.g. M matching inside (?<M>...)).
  const tokens: [string, string, string][] = [
    // [token, placeholder, regex fragment]
    ['yyyy', '\x01Y\x01', '(?<y>\\d{4})'],
    ['MMMM', '\x01ML\x01', '(?<ML>[A-Za-z]+)'],
    ['MMM', '\x01MS\x01', '(?<MS>[A-Za-z]{3})'],
    ['MM', '\x01M2\x01', '(?<M>\\d{2})'],
    ['M', '\x01M1\x01', '(?<M>\\d{1,2})'],
    ['dd', '\x01D2\x01', '(?<d>\\d{2})'],
    ['d', '\x01D1\x01', '(?<d>\\d{1,2})'],
  ];

  // Step 1: Replace tokens with placeholders (longest first, already ordered)
  let work = pattern;
  for (const [token, placeholder] of tokens) {
    work = work.replace(token, placeholder);
  }

  // Step 2: Escape any remaining regex-special characters in the literal parts
  work = work.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Step 3: Replace placeholders with actual regex groups
  for (const [, placeholder, regex] of tokens) {
    work = work.replace(placeholder, regex);
  }

  // Un-escape commas
  const re = work.replace('\\,', ',');

  const match = s.match(new RegExp(`^${re}$`));
  if (!match?.groups) return new Date(NaN);

  const g = match.groups;
  const year = parseInt(g.y);

  let month: number;
  if (g.M) {
    month = parseInt(g.M) - 1;
  } else if (g.ML) {
    const m = MONTH_LOOKUP[g.ML.toLowerCase()];
    if (m === undefined) return new Date(NaN);
    month = m;
  } else if (g.MS) {
    const m = MONTH_LOOKUP[g.MS.toLowerCase()];
    if (m === undefined) return new Date(NaN);
    month = m;
  } else {
    return new Date(NaN);
  }

  const day = parseInt(g.d);
  if (month < 0 || month > 11 || day < 1 || day > 31) return new Date(NaN);

  return new Date(year, month, day);
}

// ── Arithmetic ──────────────────────────────────────────────────────────────

const DAY_MS = 86_400_000;

/** Add (or subtract if negative) calendar days. */
export function addDays(date: Date | string, days: number): Date {
  if (typeof date === 'string') date = new Date(date);
  const result = new Date(date.getTime());
  result.setDate(result.getDate() + days);
  return result;
}

/** Subtract calendar days. */
export function subDays(date: Date | string, days: number): Date {
  return addDays(date, -days);
}

/** Add n business days (skipping Saturday and Sunday). */
export function addBusinessDays(date: Date | string, days: number): Date {
  if (typeof date === 'string') date = new Date(date);
  let remaining = days;
  const result = new Date(date.getTime());
  const direction = days >= 0 ? 1 : -1;
  remaining = Math.abs(remaining);

  while (remaining > 0) {
    result.setDate(result.getDate() + direction);
    const dow = result.getDay();
    if (dow !== 0 && dow !== 6) {
      remaining--;
    }
  }
  return result;
}

// ── Comparisons ─────────────────────────────────────────────────────────────

/** Check if a date falls within [start, end] inclusive. */
export function isWithinInterval(
  date: Date | string,
  interval: { start: Date | string; end: Date | string },
): boolean {
  if (typeof date === 'string') date = new Date(date);
  const t = date.getTime();
  const start = typeof interval.start === 'string' ? new Date(interval.start) : interval.start;
  const end = typeof interval.end === 'string' ? new Date(interval.end) : interval.end;
  return t >= start.getTime() && t <= end.getTime();
}

/** Return the earliest date from an array. */
export function dateMin(dates: Date[]): Date {
  return new Date(Math.min(...dates.map(d => d.getTime())));
}

/** Return the latest date from an array. */
export function dateMax(dates: Date[]): Date {
  return new Date(Math.max(...dates.map(d => d.getTime())));
}

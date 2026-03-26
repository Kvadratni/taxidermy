import { formatDate as format, subDays } from '@/lib/date-utils';
import { FxRateCache } from '@/types';

const CACHE_KEY = 'taxidermy_fx_cache';

function getCache(): FxRateCache {
  if (typeof window === 'undefined') return {};
  try {
    const stored = localStorage.getItem(CACHE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

function saveCache(cache: FxRateCache): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // localStorage full or unavailable
  }
}

export async function fetchFxRates(
  currency: string,
  startDate: Date,
  endDate: Date
): Promise<Record<string, number>> {
  if (currency === 'CAD') {
    return {};
  }

  const seriesName = `FX${currency}CAD`;
  const start = format(startDate, 'yyyy-MM-dd');
  const end = format(endDate, 'yyyy-MM-dd');

  const url = `https://www.bankofcanada.ca/valet/observations/${seriesName}/json?start_date=${start}&end_date=${end}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch FX rates for ${currency}: ${response.statusText}`);
  }

  const data = await response.json();
  const rates: Record<string, number> = {};

  for (const obs of data.observations ?? []) {
    const date = obs.d as string;
    const rateValue = obs[seriesName]?.v;
    if (rateValue) {
      rates[date] = parseFloat(rateValue);
    }
  }

  // Save to cache
  const cache = getCache();
  if (!cache[seriesName]) cache[seriesName] = {};
  Object.assign(cache[seriesName], rates);
  saveCache(cache);

  return rates;
}

export function lookupRate(
  rates: Record<string, number>,
  date: Date
): number {
  // Try exact date first, then go back up to 7 days for weekends/holidays
  for (let i = 0; i < 7; i++) {
    const key = format(subDays(date, i), 'yyyy-MM-dd');
    if (rates[key] !== undefined) {
      return rates[key];
    }
  }
  throw new Error(
    `No FX rate found for ${format(date, 'yyyy-MM-dd')} (checked 7 days back)`
  );
}

export function getCachedRates(currency: string): Record<string, number> {
  const cache = getCache();
  const seriesName = `FX${currency}CAD`;
  return cache[seriesName] ?? {};
}

'use client';

import { useAppStore } from '@/store/useAppStore';
import { useMemo, useState } from 'react';
import { formatDate as format } from '@/lib/date-utils';

type SortKey = 'settlementDate' | 'tradeDate';
type SortDir = 'asc' | 'desc';

export default function TransactionsTable() {
  const transactions = useAppStore((s) => s.transactions);
  const [expanded, setExpanded] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('settlementDate');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };

  const sorted = useMemo(() => {
    const mult = sortDir === 'asc' ? 1 : -1;
    return [...transactions].sort((a, b) => {
      const aRaw = sortKey === 'tradeDate' ? (a.tradeDate ?? a.settlementDate) : a.settlementDate;
      const bRaw = sortKey === 'tradeDate' ? (b.tradeDate ?? b.settlementDate) : b.settlementDate;
      const aTime = aRaw instanceof Date ? aRaw.getTime() : new Date(aRaw).getTime();
      const bTime = bRaw instanceof Date ? bRaw.getTime() : new Date(bRaw).getTime();
      return mult * (aTime - bTime);
    });
  }, [transactions, sortKey, sortDir]);

  if (sorted.length === 0) return null;

  const visible = expanded ? sorted : sorted.slice(0, 20);
  const hasMore = sorted.length > 20;

  return (
    <div>
      <div className="flex items-end justify-between mb-1">
        <h3
          className="text-2xl font-extrabold tracking-tight text-primary"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          All Transactions
        </h3>
        <span className="text-xs text-secondary font-semibold">
          {sorted.length} total
        </span>
      </div>
      <p className="text-xs text-secondary mb-5 uppercase tracking-wider" style={{ fontFamily: 'var(--font-display)' }}>
        Complete buy &amp; sell history
      </p>

      <div className="overflow-x-auto rounded-lg" style={{ background: 'var(--color-surface-low)' }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(var(--color-outline-variant-raw), 0.15)' }}>
              {([
                { label: 'Trade Date', key: 'tradeDate' as SortKey },
                { label: 'Settlement Date', key: 'settlementDate' as SortKey },
              ]).map(({ label, key }) => (
                <th
                  key={label}
                  className="px-3 py-2.5 font-bold text-xs uppercase tracking-wider text-left cursor-pointer select-none hover:text-primary transition-colors"
                  style={{ fontFamily: 'var(--font-display)', color: sortKey === key ? 'var(--color-primary)' : undefined, minWidth: '6.5rem' }}
                  onClick={() => toggleSort(key)}
                >
                  {label}{' '}{sortKey === key && <span>{sortDir === 'asc' ? '↑' : '↓'}</span>}
                </th>
              ))}
              {['Action', 'Symbol', 'Quantity', 'Price', 'Currency', 'FX Rate', 'Price (CAD)', 'Commission', 'Total (CAD)'].map((h) => (
                <th
                  key={h}
                  className={`px-3 py-2.5 font-bold text-xs uppercase tracking-wider text-secondary ${
                    ['Action', 'Symbol', 'Currency'].includes(h) ? 'text-left' : 'text-right'
                  }`}
                  style={{ fontFamily: 'var(--font-display)' }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((t, i) => (
              <tr
                key={t.id}
                style={{
                  borderTop: '1px solid rgba(var(--color-outline-variant-raw), 0.12)',
                  background: i % 2 === 0 ? 'var(--color-surface)' : 'var(--color-surface-low)',
                }}
              >
                <td className="px-3 py-2 text-xs text-secondary font-semibold whitespace-nowrap" style={{ minWidth: '6.5rem' }}>
                  {t.tradeDate ? format(t.tradeDate, 'yyyy-MM-dd') : '—'}
                </td>
                <td className="px-3 py-2 text-xs text-secondary font-semibold whitespace-nowrap" style={{ minWidth: '6.5rem' }}>
                  {format(t.settlementDate, 'yyyy-MM-dd')}
                </td>
                <td className="px-3 py-2">
                  <span
                    className="text-xs font-bold px-1.5 py-0.5 rounded"
                    style={{
                      background: t.action === 'BUY'
                        ? 'rgba(16, 185, 129, 0.15)'
                        : 'rgba(239, 68, 68, 0.15)',
                      color: t.action === 'BUY'
                        ? 'var(--color-primary)'
                        : 'var(--color-loss)',
                    }}
                  >
                    {t.action}
                  </span>
                </td>
                <td className="px-3 py-2 font-bold text-on-surface" style={{ fontFamily: 'var(--font-display)' }}>
                  {t.symbol}
                </td>
                <td className="px-3 py-2 text-right text-on-surface">{t.quantity}</td>
                <td className="px-3 py-2 text-right text-on-surface">${t.pricePerShare.toFixed(2)}</td>
                <td className="px-3 py-2 text-xs text-secondary">{t.currency}</td>
                <td className="px-3 py-2 text-right text-xs text-secondary">
                  {t.currency !== 'CAD' ? t.fxRate.toFixed(4) : '—'}
                </td>
                <td className="px-3 py-2 text-right font-semibold text-on-surface">
                  ${t.pricePerShareCAD.toFixed(2)}
                </td>
                <td className="px-3 py-2 text-right text-secondary">
                  {t.commission > 0 ? `$${t.commission.toFixed(2)}` : '—'}
                </td>
                <td className="px-3 py-2 text-right font-semibold text-on-surface">
                  ${t.totalCAD.toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {hasMore && !expanded && (
        <div className="text-center mt-3">
          <button
            onClick={() => setExpanded(true)}
            className="text-xs font-semibold text-primary hover:underline"
          >
            Show all {sorted.length} transactions
          </button>
        </div>
      )}
      {expanded && hasMore && (
        <div className="text-center mt-3">
          <button
            onClick={() => setExpanded(false)}
            className="text-xs font-semibold text-primary hover:underline"
          >
            Collapse
          </button>
        </div>
      )}
    </div>
  );
}

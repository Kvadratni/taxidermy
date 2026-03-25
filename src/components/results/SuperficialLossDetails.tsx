'use client';

import { useAppStore } from '@/store/useAppStore';
import { useMemo } from 'react';
import { AlertTriangle } from 'lucide-react';

export default function SuperficialLossDetails() {
  const allLosses = useAppStore((s) => s.superficialLosses);
  const allDispositions = useAppStore((s) => s.dispositions);
  const taxYear = useAppStore((s) => s.taxYear);

  const superficialLosses = useMemo(() => {
    return allLosses.filter((l) => {
      // Find the disposition this loss belongs to, to check the year
      const disp = allDispositions.find((d) => d.transaction.id === l.dispositionId);
      if (!disp) return false;
      return disp.transaction.settlementDate.getFullYear() === taxYear;
    });
  }, [allLosses, allDispositions, taxYear]);

  const dispositions = allDispositions; // For rendering inside map

  if (superficialLosses.length === 0) return null;

  return (
    <div>
      <h3
        className="text-base font-bold mb-3 flex items-center gap-2 text-on-surface"
        style={{ fontFamily: 'var(--font-display)' }}
      >
        <AlertTriangle size={16} style={{ color: 'var(--color-loss)' }} />
        Superficial Losses ({superficialLosses.length})
      </h3>
      <p className="text-xs text-secondary mb-4">
        Under ITA Section 54, capital losses are denied when you repurchase the same security
        within 30 days before or after the sale and still hold it 30 days after.
        The denied loss is added to the ACB of the replacement shares.
      </p>

      <div className="space-y-3">
        {superficialLosses.map((sl, i) => {
          const disp = dispositions.find(
            (d) => d.transaction.id === sl.dispositionId
          );
          if (!disp) return null;

          return (
            <div
              key={i}
              className="rounded-lg p-4 text-sm"
              style={{
                background: 'var(--color-surface-low)',
                border: `1px solid rgba(var(--color-tertiary-raw), 0.2)`,
              }}
            >
              <div
                className="font-bold mb-2 text-on-surface"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                {disp.transaction.symbol} — Sold {sl.sharesSold} shares
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                <div>
                  <div className="text-secondary mb-0.5">Shares Sold (S)</div>
                  <div className="font-semibold text-on-surface">{sl.sharesSold}</div>
                </div>
                <div>
                  <div className="text-secondary mb-0.5">Purchased in Window (P)</div>
                  <div className="font-semibold text-on-surface">{sl.sharesPurchasedInWindow}</div>
                </div>
                <div>
                  <div className="text-secondary mb-0.5">Held at Day +30 (B)</div>
                  <div className="font-semibold text-on-surface">{sl.sharesHeldAfter}</div>
                </div>
                <div>
                  <div className="text-secondary mb-0.5">Total Loss (L)</div>
                  <div className="font-semibold" style={{ color: 'var(--color-loss)' }}>
                    ${sl.totalLoss.toFixed(2)}
                  </div>
                </div>
              </div>
              <div
                className="mt-2 pt-2 text-xs"
                style={{ borderTop: `1px solid rgba(var(--color-outline-variant-raw), 0.2)` }}
              >
                <span className="text-secondary">Formula: </span>
                <span className="font-mono text-on-surface-variant">
                  SL = min({sl.sharesSold}, {sl.sharesPurchasedInWindow},{' '}
                  {sl.sharesHeldAfter}) / {sl.sharesSold} * ${sl.totalLoss.toFixed(2)}
                </span>
                <span
                  className="ml-2 font-semibold"
                  style={{ color: 'var(--color-loss)', fontFamily: 'var(--font-display)' }}
                >
                  = ${sl.deniedLoss.toFixed(2)} denied
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

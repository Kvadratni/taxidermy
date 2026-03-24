'use client';

import { useAppStore } from '@/store/useAppStore';
import { AlertTriangle } from 'lucide-react';

export default function SuperficialLossDetails() {
  const superficialLosses = useAppStore((s) => s.superficialLosses);
  const dispositions = useAppStore((s) => s.dispositions);

  if (superficialLosses.length === 0) return null;

  return (
    <div>
      <h3 className="text-base font-semibold text-zinc-900 mb-3 flex items-center gap-2">
        <AlertTriangle size={16} className="text-amber-500" />
        Superficial Losses ({superficialLosses.length})
      </h3>
      <p className="text-xs text-zinc-500 mb-4">
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
              className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm"
            >
              <div className="font-medium text-zinc-900 mb-2">
                {disp.transaction.symbol} - Sold {sl.sharesSold} shares
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                <div>
                  <div className="text-zinc-500">Shares Sold (S)</div>
                  <div className="font-medium">{sl.sharesSold}</div>
                </div>
                <div>
                  <div className="text-zinc-500">Purchased in Window (P)</div>
                  <div className="font-medium">{sl.sharesPurchasedInWindow}</div>
                </div>
                <div>
                  <div className="text-zinc-500">Held at Day +30 (B)</div>
                  <div className="font-medium">{sl.sharesHeldAfter}</div>
                </div>
                <div>
                  <div className="text-zinc-500">Total Loss (L)</div>
                  <div className="font-medium text-red-600">
                    ${sl.totalLoss.toFixed(2)}
                  </div>
                </div>
              </div>
              <div className="mt-2 pt-2 border-t border-amber-200 text-xs">
                <span className="text-zinc-500">Formula: </span>
                <span className="font-mono">
                  SL = min({sl.sharesSold}, {sl.sharesPurchasedInWindow},{' '}
                  {sl.sharesHeldAfter}) / {sl.sharesSold} * ${sl.totalLoss.toFixed(2)}
                </span>
                <span className="ml-2 font-semibold text-amber-700">
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

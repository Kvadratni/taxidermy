'use client';

import { useAppStore } from '@/store/useAppStore';
import { format } from 'date-fns';

export default function Schedule3Report() {
  const dispositions = useAppStore((s) => s.dispositions);

  if (dispositions.length === 0) {
    return (
      <div className="rounded-lg border border-zinc-200 p-8 text-center text-sm text-zinc-500">
        No dispositions to display.
      </div>
    );
  }

  const totalProceeds = dispositions.reduce((s, d) => s + d.proceeds, 0);
  const totalAcb = dispositions.reduce((s, d) => s + d.acbOfSharesSold, 0);
  const totalOutlays = dispositions.reduce((s, d) => s + d.outlays, 0);
  const totalGainLoss = dispositions.reduce((s, d) => s + d.allowedGainLoss, 0);
  const totalDenied = dispositions.reduce((s, d) => s + d.superficialLoss, 0);

  return (
    <div>
      <h3 className="text-base font-semibold text-zinc-900 mb-3">
        Schedule 3 - Capital Gains (or Losses)
      </h3>
      <p className="text-xs text-zinc-500 mb-4">
        Part 3: Publicly traded shares, mutual fund units, and other securities
      </p>

      <div className="overflow-x-auto rounded-lg border border-zinc-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-zinc-50 text-left">
              <th className="px-3 py-2 font-medium text-zinc-600">Date</th>
              <th className="px-3 py-2 font-medium text-zinc-600">Description</th>
              <th className="px-3 py-2 font-medium text-zinc-600">Year Acquired</th>
              <th className="px-3 py-2 font-medium text-zinc-600 text-right">Proceeds</th>
              <th className="px-3 py-2 font-medium text-zinc-600 text-right">ACB</th>
              <th className="px-3 py-2 font-medium text-zinc-600 text-right">Outlays</th>
              <th className="px-3 py-2 font-medium text-zinc-600 text-right">Gain (Loss)</th>
              <th className="px-3 py-2 font-medium text-zinc-600 text-right">SL Denied</th>
            </tr>
          </thead>
          <tbody>
            {dispositions.map((d, i) => (
              <tr
                key={i}
                className={`border-t border-zinc-100 ${
                  d.isSuperficialLoss ? 'bg-amber-50' : ''
                }`}
              >
                <td className="px-3 py-2 text-zinc-600">
                  {format(d.transaction.date, 'yyyy-MM-dd')}
                </td>
                <td className="px-3 py-2 text-zinc-900 font-medium">
                  {d.transaction.symbol}{' '}
                  <span className="text-zinc-400 font-normal">
                    ({d.transaction.quantity} shares)
                  </span>
                </td>
                <td className="px-3 py-2 text-zinc-600">{d.yearOfAcquisition}</td>
                <td className="px-3 py-2 text-right text-zinc-700">
                  ${d.proceeds.toFixed(2)}
                </td>
                <td className="px-3 py-2 text-right text-zinc-700">
                  ${d.acbOfSharesSold.toFixed(2)}
                </td>
                <td className="px-3 py-2 text-right text-zinc-700">
                  ${d.outlays.toFixed(2)}
                </td>
                <td
                  className={`px-3 py-2 text-right font-medium ${
                    d.allowedGainLoss >= 0 ? 'text-emerald-600' : 'text-red-600'
                  }`}
                >
                  ${d.allowedGainLoss.toFixed(2)}
                </td>
                <td className="px-3 py-2 text-right text-amber-600">
                  {d.isSuperficialLoss ? `$${d.superficialLoss.toFixed(2)}` : ''}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-zinc-300 bg-zinc-50 font-semibold">
              <td colSpan={3} className="px-3 py-2 text-zinc-900">
                Total ({dispositions.length} dispositions)
              </td>
              <td className="px-3 py-2 text-right text-zinc-900">
                ${totalProceeds.toFixed(2)}
              </td>
              <td className="px-3 py-2 text-right text-zinc-900">
                ${totalAcb.toFixed(2)}
              </td>
              <td className="px-3 py-2 text-right text-zinc-900">
                ${totalOutlays.toFixed(2)}
              </td>
              <td
                className={`px-3 py-2 text-right ${
                  totalGainLoss >= 0 ? 'text-emerald-600' : 'text-red-600'
                }`}
              >
                ${totalGainLoss.toFixed(2)}
              </td>
              <td className="px-3 py-2 text-right text-amber-600">
                {totalDenied > 0 ? `$${totalDenied.toFixed(2)}` : ''}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {totalDenied > 0 && (
        <p className="mt-2 text-xs text-amber-600">
          * Highlighted rows had superficial losses denied under ITA Section 54. Denied amounts were added to the ACB of remaining shares.
        </p>
      )}
    </div>
  );
}

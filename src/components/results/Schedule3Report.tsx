'use client';

import { useAppStore } from '@/store/useAppStore';
import { format } from 'date-fns';

function FxAmount({ original, currency, fxRate }: { original: number; currency: string; fxRate: number }) {
  return (
    <div className="text-xs mt-0.5" style={{ color: '#c0c8c3' }}>
      {currency} ${original.toFixed(2)} @ {fxRate.toFixed(4)}
    </div>
  );
}

// "Ghost border" fallback: outline-variant at 15% opacity
const rowBorder = '1px solid rgba(192,200,195,0.15)';

export default function Schedule3Report() {
  const dispositions = useAppStore((s) => s.dispositions);

  if (dispositions.length === 0) {
    return (
      <div className="rounded-lg p-8 text-center text-sm text-secondary" style={{ background: '#f4f4f1' }}>
        No dispositions to display.
      </div>
    );
  }

  const totalProceeds  = dispositions.reduce((s, d) => s + d.proceeds, 0);
  const totalAcb       = dispositions.reduce((s, d) => s + d.acbOfSharesSold, 0);
  const totalOutlays   = dispositions.reduce((s, d) => s + d.outlays, 0);
  const totalGainLoss  = dispositions.reduce((s, d) => s + d.allowedGainLoss, 0);
  const totalDenied    = dispositions.reduce((s, d) => s + d.superficialLoss, 0);

  const foreignCurrencies = [...new Set(
    dispositions.map((d) => d.transaction.currency).filter((c) => c !== 'CAD')
  )];

  return (
    <div>
      <h3
        className="text-2xl font-extrabold tracking-tight text-primary mb-1"
        style={{ fontFamily: 'var(--font-display)' }}
      >
        Schedule 3
      </h3>
      <p className="text-xs text-secondary mb-5 uppercase tracking-wider" style={{ fontFamily: 'var(--font-display)' }}>
        Capital Gains (or Losses) · Publicly traded shares &amp; securities
      </p>

      {foreignCurrencies.length > 0 && (
        <div
          className="mb-5 rounded-lg px-4 py-3 text-xs"
          style={{ background: '#d5e6e2', color: '#00261b' }}
        >
          All amounts shown in <strong>CAD</strong>. Original values were in{' '}
          <strong>{foreignCurrencies.join(', ')}</strong> — converted using Bank of Canada historical rates.
          Original amounts appear in grey below each CAD figure.
        </div>
      )}

      <div className="overflow-x-auto rounded-lg" style={{ background: '#f4f4f1' }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: rowBorder }}>
              {['Date', 'Description', 'Year Acq.', 'Proceeds', 'ACB', 'Outlays', 'Gain (Loss)', 'SL Denied'].map((h) => (
                <th
                  key={h}
                  className={`px-4 py-3 font-bold text-xs uppercase tracking-wider text-secondary ${h === 'Date' || h === 'Description' || h === 'Year Acq.' ? 'text-left' : 'text-right'}`}
                  style={{ fontFamily: 'var(--font-display)' }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dispositions.map((d, i) => (
              <tr
                key={i}
                style={{
                  borderTop: rowBorder,
                  background: d.isSuperficialLoss
                    ? 'rgba(58,20,17,0.04)'
                    : i % 2 === 0 ? '#f9f9f7' : '#f4f4f1',
                }}
              >
                <td className="px-4 py-3 text-xs text-secondary">
                  {format(d.transaction.date, 'yyyy-MM-dd')}
                </td>
                <td className="px-4 py-3">
                  <span className="font-bold text-on-surface" style={{ fontFamily: 'var(--font-display)' }}>
                    {d.transaction.symbol}
                  </span>
                  {' '}
                  <span
                    className="text-xs px-1.5 py-0.5 rounded"
                    style={{ background: '#d5e6e2', color: '#00261b', fontFamily: 'var(--font-display)', fontWeight: 600 }}
                  >
                    {d.transaction.quantity} sh
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-secondary">{d.yearOfAcquisition}</td>

                <td className="px-4 py-3 text-right">
                  <span className="font-semibold text-on-surface">${d.proceeds.toFixed(2)}</span>
                  {d.transaction.currency !== 'CAD' && d.transaction.fxRate !== 1 && (
                    <FxAmount
                      original={d.transaction.pricePerShare * d.transaction.quantity}
                      currency={d.transaction.currency}
                      fxRate={d.transaction.fxRate}
                    />
                  )}
                </td>

                <td className="px-4 py-3 text-right">
                  <span className="font-semibold text-on-surface">${d.acbOfSharesSold.toFixed(2)}</span>
                  {d.transaction.currency !== 'CAD' && d.transaction.glOriginalAcb !== undefined && (
                    <div className="text-xs mt-0.5" style={{ color: '#c0c8c3' }}>
                      {d.transaction.currency} ${d.transaction.glOriginalAcb.toFixed(2)} (acq. rate)
                    </div>
                  )}
                </td>

                <td className="px-4 py-3 text-right text-on-surface">${d.outlays.toFixed(2)}</td>

                <td className="px-4 py-3 text-right font-bold" style={{
                  fontFamily: 'var(--font-display)',
                  color: d.allowedGainLoss >= 0 ? '#00261b' : '#3a1411',
                }}>
                  ${d.allowedGainLoss.toFixed(2)}
                </td>

                <td className="px-4 py-3 text-right text-xs" style={{ color: '#3a1411' }}>
                  {d.isSuperficialLoss ? `$${d.superficialLoss.toFixed(2)}` : ''}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: '1px solid rgba(192,200,195,0.4)' }}>
              <td
                colSpan={3}
                className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-secondary"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                Total — {dispositions.length} dispositions
              </td>
              <td className="px-4 py-3 text-right font-bold text-on-surface" style={{ fontFamily: 'var(--font-display)' }}>
                ${totalProceeds.toFixed(2)}
              </td>
              <td className="px-4 py-3 text-right font-bold text-on-surface" style={{ fontFamily: 'var(--font-display)' }}>
                ${totalAcb.toFixed(2)}
              </td>
              <td className="px-4 py-3 text-right font-bold text-on-surface" style={{ fontFamily: 'var(--font-display)' }}>
                ${totalOutlays.toFixed(2)}
              </td>
              <td className="px-4 py-3 text-right font-extrabold" style={{
                fontFamily: 'var(--font-display)',
                color: totalGainLoss >= 0 ? '#00261b' : '#3a1411',
              }}>
                ${totalGainLoss.toFixed(2)}
              </td>
              <td className="px-4 py-3 text-right text-xs font-bold" style={{ color: '#3a1411' }}>
                {totalDenied > 0 ? `$${totalDenied.toFixed(2)}` : ''}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {totalDenied > 0 && (
        <p className="mt-3 text-xs" style={{ color: '#3a1411' }}>
          * Highlighted rows: superficial losses denied under ITA §54. Denied amounts added to ACB of remaining shares.
        </p>
      )}
    </div>
  );
}

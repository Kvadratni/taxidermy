'use client';

import { useMemo } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { estimateTax } from '@/lib/engine/tax-estimator';
import { PROVINCES } from '@/lib/constants/provinces';
import ProvinceSelector from './ProvinceSelector';
import { TrendingUp, TrendingDown, AlertCircle } from 'lucide-react';

export default function TaxSummary() {
  const allDispositions = useAppStore((s) => s.dispositions);
  const taxYear      = useAppStore((s) => s.taxYear);
  const province     = useAppStore((s) => s.province);

  const dispositions = useMemo(() => {
    return allDispositions.filter((d) => d.transaction.date.getFullYear() === taxYear);
  }, [allDispositions, taxYear]);

  const totalGains  = dispositions.filter((d) => d.allowedGainLoss > 0).reduce((s, d) => s + d.allowedGainLoss, 0);
  const totalLosses = dispositions.filter((d) => d.allowedGainLoss < 0).reduce((s, d) => s + d.allowedGainLoss, 0);
  const rawLosses   = dispositions.filter((d) => d.rawGainLoss < 0).reduce((s, d) => s + Math.abs(d.rawGainLoss), 0);
  const deniedLosses = dispositions.reduce((s, d) => s + d.superficialLoss, 0);
  const netGainLoss = totalGains + totalLosses;

  const taxEstimate = useMemo(() => estimateTax(Math.max(0, netGainLoss), province), [netGainLoss, province]);
  const provinceName = PROVINCES.find((p) => p.code === province)?.name ?? province;

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <h3
          className="text-2xl font-extrabold tracking-tight text-primary"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          Tax Summary
        </h3>
        <ProvinceSelector />
      </div>

      {/* Hero metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {/* Gains */}
        <div className="rounded-lg p-5" style={{ background: 'var(--color-surface-low)' }}>
          <div
            className="flex items-center gap-1.5 text-xs font-semibold text-secondary mb-2 uppercase tracking-wider"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            <TrendingUp size={12} />
            Total Gains
          </div>
          <div
            className="text-2xl font-extrabold"
            style={{ fontFamily: 'var(--font-display)', color: 'var(--color-primary)' }}
          >
            ${totalGains.toFixed(2)}
          </div>
        </div>

        {/* Losses */}
        <div className="rounded-lg p-5 flex flex-col justify-between" style={{ background: 'var(--color-surface-low)' }}>
          <div>
            <div
              className="flex items-center gap-1.5 text-xs font-semibold text-secondary mb-2 uppercase tracking-wider"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              <TrendingDown size={12} />
              Claimable Losses
            </div>
            <div
              className={`text-2xl font-extrabold ${Math.abs(totalLosses) < 0.01 ? 'text-secondary' : ''}`}
              style={{ fontFamily: 'var(--font-display)', color: Math.abs(totalLosses) < 0.01 ? undefined : 'var(--color-loss)' }}
            >
              ${totalLosses.toFixed(2)}
            </div>
          </div>
          
          {deniedLosses > 0 && (
            <div 
              className="mt-3 pt-2 text-[10px] font-semibold tracking-wide flex justify-between"
              style={{ borderTop: `1px solid rgba(var(--color-outline-variant-raw), 0.2)`, fontFamily: 'var(--font-display)' }}
            >
              <span className="text-secondary uppercase">Gross: ${rawLosses.toFixed(2)}</span>
              <span className="uppercase" style={{ color: 'var(--color-loss)' }}>Denied: ${deniedLosses.toFixed(2)}</span>
            </div>
          )}
        </div>

        {/* Net — deep forest green hero card (same in both modes) */}
        <div className="rounded-lg p-5" style={{ background: 'linear-gradient(160deg,#00261b,#0b3d2e)' }}>
          <div
            className="text-xs font-semibold mb-2 uppercase tracking-wider"
            style={{ fontFamily: 'var(--font-display)', color: 'rgba(188,237,215,0.7)' }}
          >
            Net Gain / Loss
          </div>
          <div
            className="text-2xl font-extrabold"
            style={{ fontFamily: 'var(--font-display)', color: netGainLoss >= 0 ? '#bcedd7' : 'var(--color-loss-muted)' }}
          >
            ${netGainLoss.toFixed(2)}
          </div>
        </div>

        {/* Taxable — deep forest green hero card (same in both modes) */}
        <div className="rounded-lg p-5" style={{ background: 'linear-gradient(160deg,#00261b,#0b3d2e)' }}>
          <div
            className="text-xs font-semibold mb-2 uppercase tracking-wider"
            style={{ fontFamily: 'var(--font-display)', color: 'rgba(188,237,215,0.7)' }}
          >
            Taxable (50%)
          </div>
          <div className="text-2xl font-extrabold text-white" style={{ fontFamily: 'var(--font-display)' }}>
            ${taxEstimate.taxableCapitalGains.toFixed(2)}
          </div>
        </div>
      </div>

      {/* Estimated tax breakdown */}
      {netGainLoss > 0 && (
        <div className="rounded-lg p-5" style={{ background: 'var(--color-surface-low)' }}>
          <h4
            className="text-xs font-bold uppercase tracking-wider text-secondary mb-4"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            Estimated Tax — {provinceName}
          </h4>
          <div className="grid grid-cols-3 gap-6">
            <div>
              <div className="text-xs text-secondary mb-1">Federal</div>
              <div className="text-lg font-bold text-on-surface" style={{ fontFamily: 'var(--font-display)' }}>
                ${taxEstimate.federalTax.toFixed(2)}
              </div>
            </div>
            <div>
              <div className="text-xs text-secondary mb-1">Provincial</div>
              <div className="text-lg font-bold text-on-surface" style={{ fontFamily: 'var(--font-display)' }}>
                ${taxEstimate.provincialTax.toFixed(2)}
              </div>
            </div>
            <div>
              <div className="text-xs text-secondary mb-1">Combined</div>
              <div className="text-lg font-extrabold text-primary" style={{ fontFamily: 'var(--font-display)' }}>
                ${taxEstimate.combinedTax.toFixed(2)}
              </div>
            </div>
          </div>
          <div className="mt-4 text-xs text-secondary">
            Effective rate on total gains: {(taxEstimate.effectiveRate * 100).toFixed(1)}%
          </div>
        </div>
      )}

      {/* Net loss notice */}
      {netGainLoss < 0 && (
        <div
          className="rounded-lg p-4 flex items-start gap-3"
          style={{ background: 'var(--color-secondary-container)', color: 'var(--color-primary)' }}
        >
          <AlertCircle size={15} className="mt-0.5 shrink-0" />
          <p className="text-sm">
            Net capital loss of <strong>${Math.abs(netGainLoss).toFixed(2)}</strong>.
            Carry back up to 3 years or forward indefinitely to offset future capital gains.
          </p>
        </div>
      )}

      <p className="mt-5 text-xs text-on-surface-variant opacity-60">
        Estimate only. Actual tax depends on total income and deductions. Consult a tax professional.
      </p>
    </div>
  );
}

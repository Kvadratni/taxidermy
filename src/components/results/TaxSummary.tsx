'use client';

import { useMemo } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { estimateTax } from '@/lib/engine/tax-estimator';
import { PROVINCES } from '@/lib/constants/provinces';
import ProvinceSelector from './ProvinceSelector';
import { TrendingUp, TrendingDown, AlertCircle } from 'lucide-react';

export default function TaxSummary() {
  const dispositions = useAppStore((s) => s.dispositions);
  const province = useAppStore((s) => s.province);

  const totalGains = dispositions
    .filter((d) => d.allowedGainLoss > 0)
    .reduce((s, d) => s + d.allowedGainLoss, 0);

  const totalLosses = dispositions
    .filter((d) => d.allowedGainLoss < 0)
    .reduce((s, d) => s + d.allowedGainLoss, 0);

  const netGainLoss = totalGains + totalLosses;

  const taxEstimate = useMemo(
    () => estimateTax(Math.max(0, netGainLoss), province),
    [netGainLoss, province]
  );

  const provinceName = PROVINCES.find((p) => p.code === province)?.name ?? province;

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <h3 className="text-base font-semibold text-zinc-900">Tax Summary</h3>
        <ProvinceSelector />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="rounded-lg border border-zinc-200 p-4">
          <div className="flex items-center gap-2 text-xs font-medium text-zinc-500 mb-1">
            <TrendingUp size={14} className="text-emerald-500" />
            Total Gains
          </div>
          <div className="text-lg font-semibold text-emerald-600">
            ${totalGains.toFixed(2)}
          </div>
        </div>
        <div className="rounded-lg border border-zinc-200 p-4">
          <div className="flex items-center gap-2 text-xs font-medium text-zinc-500 mb-1">
            <TrendingDown size={14} className="text-red-500" />
            Total Losses
          </div>
          <div className="text-lg font-semibold text-red-600">
            ${totalLosses.toFixed(2)}
          </div>
        </div>
        <div className="rounded-lg border border-zinc-200 p-4">
          <div className="flex items-center gap-2 text-xs font-medium text-zinc-500 mb-1">
            Net Gain/Loss
          </div>
          <div
            className={`text-lg font-semibold ${
              netGainLoss >= 0 ? 'text-emerald-600' : 'text-red-600'
            }`}
          >
            ${netGainLoss.toFixed(2)}
          </div>
        </div>
        <div className="rounded-lg border border-zinc-200 p-4">
          <div className="flex items-center gap-2 text-xs font-medium text-zinc-500 mb-1">
            Taxable (50%)
          </div>
          <div className="text-lg font-semibold text-zinc-900">
            ${taxEstimate.taxableCapitalGains.toFixed(2)}
          </div>
        </div>
      </div>

      {netGainLoss > 0 && (
        <div className="rounded-lg border border-zinc-200 p-4 mb-4">
          <h4 className="text-sm font-semibold text-zinc-900 mb-3">
            Estimated Tax ({provinceName})
          </h4>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <div className="text-xs text-zinc-500">Federal Tax</div>
              <div className="font-medium">${taxEstimate.federalTax.toFixed(2)}</div>
            </div>
            <div>
              <div className="text-xs text-zinc-500">Provincial Tax</div>
              <div className="font-medium">${taxEstimate.provincialTax.toFixed(2)}</div>
            </div>
            <div>
              <div className="text-xs text-zinc-500">Combined Tax</div>
              <div className="font-semibold text-zinc-900">
                ${taxEstimate.combinedTax.toFixed(2)}
              </div>
            </div>
          </div>
          <div className="mt-3 text-xs text-zinc-500">
            Effective tax rate on total gains: {(taxEstimate.effectiveRate * 100).toFixed(1)}%
          </div>
        </div>
      )}

      {netGainLoss < 0 && (
        <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 flex items-start gap-2">
          <AlertCircle size={16} className="text-blue-500 mt-0.5 shrink-0" />
          <div className="text-sm text-blue-700">
            You have a net capital loss of ${Math.abs(netGainLoss).toFixed(2)}.
            This can be carried back up to 3 years or carried forward indefinitely
            to offset future capital gains.
          </div>
        </div>
      )}

      <div className="mt-4 text-xs text-zinc-400">
        Note: This is an estimate only. Actual tax depends on your total income and deductions.
        Consult a tax professional for advice.
      </div>
    </div>
  );
}

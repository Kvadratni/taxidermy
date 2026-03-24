'use client';

import { useAppStore } from '@/store/useAppStore';
import { PROVINCES } from '@/lib/constants/provinces';

export default function ProvinceSelector() {
  const province = useAppStore((s) => s.province);
  const setProvince = useAppStore((s) => s.setProvince);
  const taxYear = useAppStore((s) => s.taxYear);
  const setTaxYear = useAppStore((s) => s.setTaxYear);

  const selectStyle = {
    background: 'var(--color-surface)',
    border: `1px solid rgba(var(--color-outline-variant-raw), 0.4)`,
    color: 'var(--color-on-surface)',
    fontFamily: 'var(--font-display)',
  };

  return (
    <div className="flex items-center gap-4">
      <div>
        <label
          className="block text-xs font-medium text-secondary mb-1"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          Province
        </label>
        <select
          value={province}
          onChange={(e) => setProvince(e.target.value)}
          className="rounded-lg px-3 py-1.5 text-xs outline-none transition-all"
          style={selectStyle}
        >
          {PROVINCES.map((p) => (
            <option key={p.code} value={p.code}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label
          className="block text-xs font-medium text-secondary mb-1"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          Tax Year
        </label>
        <select
          value={taxYear}
          onChange={(e) => setTaxYear(parseInt(e.target.value))}
          className="rounded-lg px-3 py-1.5 text-xs outline-none transition-all"
          style={selectStyle}
        >
          {[2025, 2024, 2023].map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

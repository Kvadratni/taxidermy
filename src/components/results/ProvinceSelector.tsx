'use client';

import { useAppStore } from '@/store/useAppStore';
import { PROVINCES } from '@/lib/constants/provinces';

export default function ProvinceSelector() {
  const province = useAppStore((s) => s.province);
  const setProvince = useAppStore((s) => s.setProvince);
  const taxYear = useAppStore((s) => s.taxYear);
  const setTaxYear = useAppStore((s) => s.setTaxYear);

  return (
    <div className="flex items-center gap-4">
      <div>
        <label className="block text-xs font-medium text-zinc-500 mb-1">Province</label>
        <select
          value={province}
          onChange={(e) => setProvince(e.target.value)}
          className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
        >
          {PROVINCES.map((p) => (
            <option key={p.code} value={p.code}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-zinc-500 mb-1">Tax Year</label>
        <select
          value={taxYear}
          onChange={(e) => setTaxYear(parseInt(e.target.value))}
          className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
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

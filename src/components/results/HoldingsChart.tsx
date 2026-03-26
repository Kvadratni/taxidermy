import { useMemo, useState } from 'react';
import { Transaction } from '@/types';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { formatDate } from '@/lib/date-utils';

const COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6', '#f43f5e',
  '#6366f1', '#84cc16', '#f97316', '#d946ef', '#0ea5e9', '#eab308', '#a855f7'
];

export default function HoldingsChart({ transactions }: { transactions: Transaction[] }) {
  const [viewMode, setViewMode] = useState<'balances' | 'lots'>('balances');
  const [selectedSymbol, setSelectedSymbol] = useState<string>('');

  const { symbols, lineChartData, areaChartData, areaKeys } = useMemo(() => {
    if (!transactions || transactions.length === 0) {
      return { symbols: [], lineChartData: [], areaChartData: [], areaKeys: [] };
    }

    // 1. Organize symbols
    const bySymbol = new Map<string, Transaction[]>();
    for (const txn of transactions) {
      if (!bySymbol.has(txn.symbol)) bySymbol.set(txn.symbol, []);
      bySymbol.get(txn.symbol)!.push(txn);
    }
    const allSymbols = Array.from(bySymbol.keys()).sort();
    
    // Set default selected symbol if none selected or invalid
    const activeSymbol = allSymbols.includes(selectedSymbol) ? selectedSymbol : allSymbols[0];

    // 2. Line Chart Mode Data (All Symbols Running Balances)
    const allDatesLine = [...new Set(transactions.map(t => formatDate(t.settlementDate, 'yyyy-MM-dd')))].sort();
    const lineChartData: any[] = [];
    const balances: Record<string, number> = {};
    for (const sym of allSymbols) balances[sym] = 0;

    for (const date of allDatesLine) {
      const point: any = { name: date };
      const txnsOnDate = transactions.filter(t => formatDate(t.settlementDate, 'yyyy-MM-dd') === date);
      
      for (const txn of txnsOnDate) {
        if (txn.action === 'BUY') balances[txn.symbol] += txn.quantity;
        else if (txn.action === 'SELL') balances[txn.symbol] = Math.max(0, balances[txn.symbol] - txn.quantity);
      }

      for (const sym of allSymbols) point[sym] = Number(balances[sym].toFixed(4));
      lineChartData.push(point);
    }

    // 3. Area Chart Mode Data (Tax Lots for strictly the activeSymbol)
    const areaChartData: any[] = [];
    const areaKeys: string[] = [];
    
    if (activeSymbol) {
      const symTxns = bySymbol.get(activeSymbol)!;
      symTxns.sort((a, b) => a.settlementDate.getTime() - b.settlementDate.getTime());
      
      const allDatesArea = [...new Set(symTxns.map(t => formatDate(t.settlementDate, 'yyyy-MM-dd')))].sort();
      
      // Tracking active lots: { id: string, initQty: number, currQty: number, buyDate: string }
      type Lot = { key: string, currQty: number, buyDate: string };
      let activeLots: Lot[] = [];
      let lotCounter = 1;

      for (const date of allDatesArea) {
        const point: any = { name: date };
        const txnsOnDate = symTxns.filter(t => formatDate(t.settlementDate, 'yyyy-MM-dd') === date);
        
        let dailyBuys = 0;
        let dailySells = 0;

        for (const txn of txnsOnDate) {
          if (txn.action === 'BUY') dailyBuys += txn.quantity;
          else if (txn.action === 'SELL') dailySells += txn.quantity;
        }

        // Apply BUYS
        if (dailyBuys > 0) {
          const key = `Batch ${lotCounter++} (${date})`;
          activeLots.push({ key, currQty: dailyBuys, buyDate: date });
          areaKeys.push(key);
        }

        // Apply SELLS (FIFO depletion for visualization purposes)
        if (dailySells > 0) {
          let remainingToSell = dailySells;
          for (const lot of activeLots) {
            if (remainingToSell <= 0) break;
            if (lot.currQty > 0) {
              const sellAmount = Math.min(lot.currQty, remainingToSell);
              lot.currQty -= sellAmount;
              remainingToSell -= sellAmount;
            }
          }
        }

        // Record the states of all historical and active lots for this point
        for (const lot of activeLots) {
          point[lot.key] = Number(lot.currQty.toFixed(4));
        }

        areaChartData.push(point);
      }
    }

    return { symbols: allSymbols, lineChartData, areaChartData, areaKeys };
  }, [transactions, selectedSymbol]);

  // Handle selectedSymbol updates natively
  if (!selectedSymbol && symbols.length > 0) {
    setSelectedSymbol(symbols[0]);
  }

  if (symbols.length === 0) return null;

  return (
    <div className="w-full bg-surface-low rounded-xl p-5 mt-6 border border-outline-variant-raw/20 shadow-sm" data-pdf-chart="holdings">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wider text-secondary mb-1" style={{ fontFamily: 'var(--font-display)' }}>
            {viewMode === 'balances' ? 'Total Holdings Graph' : 'Purchase Batch Lifespans'}
          </h3>
          <p className="text-xs text-on-surface-variant max-w-sm">
            {viewMode === 'balances'
              ? 'View the running total balance of all your shares merged over time.'
              : 'Visualize exactly how individual purchase batches (lots) are held and eventually sold.'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {viewMode === 'lots' && symbols.length > 1 && (
            <select
              value={selectedSymbol}
              onChange={(e) => setSelectedSymbol(e.target.value)}
              className="text-xs font-bold bg-surface px-3 py-1.5 rounded outline-none border border-outline-variant shadow-sm text-primary"
            >
              {symbols.map(sym => <option key={sym} value={sym}>{sym}</option>)}
            </select>
          )}

          <div className="flex bg-surface-lowest rounded-md p-1 border border-outline-variant-raw/20">
            <button
              onClick={() => setViewMode('balances')}
              className={`px-3 py-1.5 text-xs font-bold rounded-sm transition-all ${viewMode === 'balances' ? 'bg-surface text-primary shadow' : 'text-secondary hover:text-on-surface'}`}
            >
              Total Balances
            </button>
            <button
              onClick={() => setViewMode('lots')}
              className={`px-3 py-1.5 text-xs font-bold rounded-sm transition-all ${viewMode === 'lots' ? 'bg-surface text-primary shadow' : 'text-secondary hover:text-on-surface'}`}
            >
              Batch Lifespans
            </button>
          </div>
        </div>
      </div>

      <div className="w-full h-80 pb-6">
        <ResponsiveContainer width="100%" height="100%">
          {viewMode === 'balances' ? (
            <LineChart data={lineChartData} margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(var(--color-outline-variant-raw), 0.3)" vertical={false} />
              <XAxis dataKey="name" stroke="var(--color-secondary)" fontSize={11} tickMargin={10} minTickGap={30} />
              <YAxis stroke="var(--color-secondary)" fontSize={11} width={40} tickFormatter={(val: number) => val >= 1000 ? `${(val / 1000).toFixed(1)}k` : val.toString()} />
              <Tooltip 
                contentStyle={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-outline-variant)', borderRadius: '8px', fontSize: '12px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}
                labelStyle={{ color: 'var(--color-on-surface)', fontWeight: 'bold', marginBottom: '4px' }}
              />
              <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} iconType="circle" />
              {symbols.map((sym, i) => (
                <Line
                  key={sym}
                  type="stepAfter"
                  dataKey={sym}
                  stroke={COLORS[i % COLORS.length]}
                  strokeWidth={2}
                  dot={{ r: 3, fill: 'var(--color-surface)', strokeWidth: 2 }}
                  activeDot={{ r: 5 }}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          ) : (
            <AreaChart data={areaChartData} margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(var(--color-outline-variant-raw), 0.3)" vertical={false} />
              <XAxis dataKey="name" stroke="var(--color-secondary)" fontSize={11} tickMargin={10} minTickGap={30} />
              <YAxis stroke="var(--color-secondary)" fontSize={11} width={40} tickFormatter={(val: number) => val >= 1000 ? `${(val / 1000).toFixed(1)}k` : val.toString()} />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload) return null;
                  const nonZero = payload.filter((p) => (p.value as number) > 0);
                  if (nonZero.length === 0) return null;
                  return (
                    <div style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-outline-variant)', borderRadius: '8px', fontSize: '12px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', padding: '8px 12px', maxHeight: '300px', overflowY: 'auto' }}>
                      <p style={{ color: 'var(--color-on-surface)', fontWeight: 'bold', marginBottom: '4px' }}>{label}</p>
                      {nonZero.map((entry) => (
                        <p key={entry.dataKey as string} style={{ color: entry.color, margin: '2px 0' }}>
                          {entry.name} : {entry.value}
                        </p>
                      ))}
                    </div>
                  );
                }}
              />
              {/* Only show legend if areaKeys is small, otherwise it gets too noisy */}
              {areaKeys.length <= 15 && <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} iconType="square" />}
              {areaKeys.map((key, i) => (
                <Area
                  key={key}
                  type="stepAfter"
                  dataKey={key}
                  stackId="1"
                  stroke={COLORS[(COLORS.length - 1 - (i % COLORS.length))]}
                  fill={COLORS[(COLORS.length - 1 - (i % COLORS.length))]}
                  fillOpacity={0.6}
                  strokeWidth={1}
                  isAnimationActive={false}
                />
              ))}
            </AreaChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

'use client';

import { useEffect } from 'react';
import { useState } from 'react';
import { ChevronDown, ChevronRight, BookOpen, X } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';

function Section({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-outline-variant/20 last:border-b-0">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 py-3 text-left text-sm font-semibold text-on-surface hover:text-primary transition-colors"
      >
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        {title}
      </button>
      {open && <div className="pb-4 pl-6 text-sm text-secondary leading-relaxed space-y-3">{children}</div>}
    </div>
  );
}

export default function MathGuide() {
  const open = useAppStore((s) => s.mathGuideOpen);
  const setOpen = useAppStore((s) => s.setMathGuideOpen);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center"
      onClick={() => setOpen(false)}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      {/* Panel */}
      <div
        className="relative mt-16 mb-16 w-full max-w-2xl max-h-[calc(100vh-8rem)] overflow-y-auto rounded-2xl border border-outline-variant/30 bg-surface shadow-2xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 text-base font-semibold text-on-surface">
            <BookOpen size={18} />
            How the Math Works
          </div>
          <button
            onClick={() => setOpen(false)}
            className="flex items-center justify-center w-8 h-8 rounded-lg text-on-surface-variant hover:text-primary hover:bg-surface-container transition-colors"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="rounded-xl border border-outline-variant/30 bg-surface-container/50 p-4">
          <Section title="Foreign Currency Conversion (USD → CAD)" defaultOpen>
            <p>
              Per subsection 261(2) of the Income Tax Act and CRA Folio S5-F4-C1, each
              transaction must be converted to CAD using the Bank of Canada exchange rate
              on the <strong>settlement date</strong> (not the trade date).
            </p>
            <div className="bg-surface-container rounded-lg p-3 font-mono text-xs">
              CAD amount = USD amount &times; BoC rate on settlement date
            </div>
            <p>
              This is a <em>multiply</em> operation. The BoC rate is expressed as
              &quot;1 USD = X.XXXX CAD&quot; — for example, a rate of 1.44 means
              one US dollar equals $1.44 Canadian.
            </p>
            <p>
              <strong>Which BoC rate?</strong> The daily closing rate (post-March 2017).
              Before that, the noon rate. Taxidermy uses the rate embedded in your
              brokerage statements, which should match the BoC rate for that date.
            </p>
          </Section>

          <Section title="Adjusted Cost Base (ACB)">
            <p>
              The ACB is the running cost basis of your shares in Canadian dollars.
              It determines your gain or loss when you sell.
            </p>
            <div className="space-y-2">
              <div className="bg-surface-container rounded-lg p-3 font-mono text-xs space-y-1">
                <div><strong>On BUY:</strong> ACB += (shares &times; price &times; FX rate) + commission</div>
                <div><strong>On SELL:</strong> ACB portion = (shares sold &divide; total shares) &times; total ACB</div>
                <div><strong>Capital gain/loss:</strong> proceeds (CAD) &minus; ACB portion &minus; outlays</div>
              </div>
            </div>
            <p>
              Each buy and sell uses the BoC rate for its own settlement date — the CRA
              does not accept average rates for capital property (IT-95R, confirmed by
              the Federal Court of Appeal in <em>Gaynor v The Queen</em>).
            </p>
          </Section>

          <Section title="Settlement Date vs Trade Date">
            <p>
              Securities in Canada settle on a T+1 basis (one business day after the
              trade). The CRA requires the <strong>settlement date</strong> for:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Looking up the Bank of Canada exchange rate</li>
              <li>Determining the tax year of a disposition</li>
              <li>Calculating the 30-day superficial loss window</li>
            </ul>
            <p>
              Taxidermy extracts both dates from your brokerage statements and uses
              the settlement date for all tax calculations.
            </p>
          </Section>

          <Section title="Superficial Loss Rule">
            <p>
              Under section 54 of the Income Tax Act, a capital loss is denied (in
              whole or in part) if you buy back the same or identical property within
              30 calendar days before or after the sale, and you still hold some at
              the end of that 61-day window.
            </p>
            <div className="bg-surface-container rounded-lg p-3 font-mono text-xs space-y-1">
              <div><strong>Window:</strong> 30 days before sale → sale date → 30 days after sale</div>
              <div><strong>Denied amount:</strong> min(shares sold, shares repurchased, shares held at end) &divide; shares sold &times; loss</div>
              <div><strong>ACB adjustment:</strong> denied loss is added to the ACB of the repurchased shares</div>
            </div>
            <p>
              The denied loss isn&apos;t gone — it increases the ACB of your remaining
              shares, so you&apos;ll realize a larger gain (or smaller loss) when you
              eventually sell them.
            </p>
          </Section>

          <Section title="Why Numbers May Differ from Other Tools">
            <p>
              You may see small differences compared to tools like AdjustedCostBase.ca.
              Common reasons:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                <strong>FX rate direction:</strong> Some tools divide by the exchange rate
                instead of multiplying. Both approaches are reasonable — the CRA rounds
                to whole dollars on your return, so a few dollars of cumulative drift
                across many transactions is within acceptable tolerance.
              </li>
              <li>
                <strong>Rate source differences:</strong> Taxidermy uses the FX rate from
                your brokerage statement. Other tools may use a manually-entered or
                differently-sourced rate.
              </li>
              <li>
                <strong>Intermediate rounding:</strong> The CRA has no prescribed decimal
                precision for intermediate calculations. Different tools round at
                different steps, causing small drift over many transactions.
              </li>
              <li>
                <strong>Trade date vs settlement date:</strong> Tools that use the trade
                date instead of the settlement date will look up a different FX rate.
              </li>
            </ul>
            <p>
              The CRA cares about: correct rate source (BoC), correct date
              (settlement for securities), and correct direction (USD &times; rate = CAD).
              Final amounts on your return are rounded to the nearest dollar. Small
              intermediate differences are not a clerical error.
            </p>
          </Section>

          <Section title="Sources &amp; References">
            <ul className="list-disc pl-5 space-y-1">
              <li>Income Tax Act, subsection 261(2) — reporting currency rules</li>
              <li>CRA Income Tax Folio S5-F4-C1 — Income Tax Reporting Currency</li>
              <li>CRA IT-95R — Foreign Exchange Gains and Losses</li>
              <li>Income Tax Act, section 54 — superficial loss definition</li>
              <li>CRA Income Tax Folio S3-F9-C1 — Lottery Winnings, Prizes, and Income Tax (ACB rules)</li>
              <li><em>Gaynor v The Queen</em> — Federal Court of Appeal, per-transaction FX rates</li>
            </ul>
          </Section>
        </div>
      </div>
    </div>
  );
}

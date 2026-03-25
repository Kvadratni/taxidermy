import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { AcbRecord, DispositionResult, SuperficialLossDetail, TaxEstimate, Transaction } from '@/types';
import { format } from 'date-fns';

// ---------------------------------------------------------------------------
// Full PDF report: Tax Summary + Holdings Chart + Schedule 3 + Securities +
// All Transactions + Superficial Loss Details
// ---------------------------------------------------------------------------

export async function downloadFullPdf(
  dispositions: DispositionResult[],
  transactions: Transaction[],
  acbSnapshots: Map<string, AcbRecord>,
  superficialLosses: SuperficialLossDetail[],
  taxEstimate: TaxEstimate | undefined,
  taxYear: number,
): Promise<void> {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentW = pageW - margin * 2;
  let y = margin;

  const darkGreen = [0, 38, 27] as [number, number, number];
  const medGreen = [11, 61, 46] as [number, number, number];
  const lightGreen = [188, 237, 215] as [number, number, number];
  const red = [220, 53, 69] as [number, number, number];

  // --- Helper: add page footer ---
  function addFooter() {
    doc.setFontSize(7);
    doc.setTextColor(150);
    doc.text(`Taxidermy — Canadian Capital Gains Calculator | Generated ${format(new Date(), 'MMMM d, yyyy')}`, margin, pageH - 6);
    doc.text(`Page ${doc.getNumberOfPages()}`, pageW - margin, pageH - 6, { align: 'right' });
  }

  // --- Helper: ensure space, add new page if needed ---
  function ensureSpace(needed: number) {
    if (y + needed > pageH - 15) {
      addFooter();
      doc.addPage();
      y = margin;
    }
  }

  // --- Helper: section title ---
  function sectionTitle(title: string, subtitle?: string) {
    ensureSpace(20);
    doc.setFontSize(16);
    doc.setTextColor(...darkGreen);
    doc.text(title, margin, y);
    y += 6;
    if (subtitle) {
      doc.setFontSize(8);
      doc.setTextColor(120);
      doc.text(subtitle, margin, y);
      y += 5;
    }
    y += 2;
  }

  // =======================================================================
  // PAGE 1: Title + Tax Summary
  // =======================================================================
  doc.setFontSize(22);
  doc.setTextColor(...darkGreen);
  doc.text('Taxidermy', margin, y + 2);
  doc.setFontSize(9);
  doc.setTextColor(100);
  doc.text('Canadian Capital Gains Calculator', margin + 52, y + 2);
  y += 10;

  doc.setFontSize(14);
  doc.setTextColor(...darkGreen);
  doc.text(`Tax Year ${taxYear} — Capital Gains Report`, margin, y);
  y += 4;
  doc.setFontSize(8);
  doc.setTextColor(120);
  doc.text(`${transactions.length} transactions → ${dispositions.length} dispositions | Generated ${format(new Date(), 'MMMM d, yyyy')}`, margin, y);
  y += 10;

  // Tax Summary box
  if (taxEstimate) {
    const totalGains = dispositions.filter(d => d.allowedGainLoss > 0).reduce((s, d) => s + d.allowedGainLoss, 0);
    const totalLosses = dispositions.filter(d => d.allowedGainLoss < 0).reduce((s, d) => s + d.allowedGainLoss, 0);
    const netGainLoss = dispositions.reduce((s, d) => s + d.allowedGainLoss, 0);
    const totalDenied = dispositions.reduce((s, d) => s + d.superficialLoss, 0);

    doc.setFillColor(...lightGreen);
    doc.roundedRect(margin, y, contentW, 38, 3, 3, 'F');

    doc.setFontSize(10);
    doc.setTextColor(...darkGreen);
    doc.text('TAX SUMMARY', margin + 5, y + 7);

    doc.setFontSize(9);
    const col1 = margin + 5;
    const col2 = margin + contentW * 0.25;
    const col3 = margin + contentW * 0.5;
    const col4 = margin + contentW * 0.75;

    doc.setTextColor(80);
    doc.text('Total Gains', col1, y + 14);
    doc.text('Claimable Losses', col2, y + 14);
    doc.text('Net Gain/Loss', col3, y + 14);
    doc.text('SL Denied', col4, y + 14);

    doc.setFontSize(13);
    doc.setTextColor(...medGreen);
    doc.text(`$${totalGains.toFixed(2)}`, col1, y + 21);
    doc.setTextColor(...red);
    doc.text(`$${totalLosses.toFixed(2)}`, col2, y + 21);
    doc.setTextColor(...(netGainLoss >= 0 ? medGreen : red));
    doc.text(`$${netGainLoss.toFixed(2)}`, col3, y + 21);
    doc.setTextColor(...red);
    doc.text(totalDenied > 0 ? `$${totalDenied.toFixed(2)}` : '—', col4, y + 21);

    doc.setFontSize(8);
    doc.setTextColor(80);
    doc.text(`Taxable (50%): $${taxEstimate.taxableCapitalGains.toFixed(2)}`, col1, y + 28);
    doc.text(`Federal: $${taxEstimate.federalTax.toFixed(2)}`, col2, y + 28);
    doc.text(`Provincial (${taxEstimate.province}): $${taxEstimate.provincialTax.toFixed(2)}`, col3, y + 28);
    doc.text(`Combined: $${taxEstimate.combinedTax.toFixed(2)} (${(taxEstimate.effectiveRate * 100).toFixed(1)}%)`, col4, y + 28);

    y += 34;

    doc.setFontSize(7);
    doc.setTextColor(150);
    doc.text('Estimate only. Actual tax depends on total income and deductions. Consult a tax professional.', margin + 5, y);
    y += 8;
  }

  // =======================================================================
  // Capture Holdings Chart from DOM
  // =======================================================================
  try {
    const chartEl = document.querySelector('[data-pdf-chart="holdings"]') as HTMLElement | null;
    if (chartEl) {
      const { default: html2canvas } = await import('html2canvas-pro');
      const canvas = await html2canvas(chartEl, {
        backgroundColor: '#ffffff',
        scale: 2,
        logging: false,
        useCORS: true,
      });
      const imgData = canvas.toDataURL('image/png');
      const imgW = contentW;
      const imgH = (canvas.height / canvas.width) * imgW;

      ensureSpace(imgH + 12);
      sectionTitle('Securities Holdings Chart');
      doc.addImage(imgData, 'PNG', margin, y, imgW, imgH);
      y += imgH + 8;
    }
  } catch {
    // Chart capture failed, skip silently
  }

  // =======================================================================
  // Schedule 3 Table
  // =======================================================================
  ensureSpace(30);
  sectionTitle('Schedule 3', 'Capital Gains (or Losses) · Publicly traded shares & securities');

  const s3Body = dispositions.map((d) => [
    format(d.transaction.settlementDate, 'yyyy-MM-dd'),
    d.transaction.symbol,
    `${d.transaction.quantity}`,
    d.yearOfAcquisition,
    `$${d.proceeds.toFixed(2)}`,
    `$${d.acbOfSharesSold.toFixed(2)}`,
    `$${d.outlays.toFixed(2)}`,
    `$${d.rawGainLoss.toFixed(2)}`,
    `$${d.allowedGainLoss.toFixed(2)}`,
    d.isSuperficialLoss ? `$${d.superficialLoss.toFixed(2)}` : '',
  ]);

  // Totals
  s3Body.push([
    'TOTAL', '', '', '',
    `$${dispositions.reduce((s, d) => s + d.proceeds, 0).toFixed(2)}`,
    `$${dispositions.reduce((s, d) => s + d.acbOfSharesSold, 0).toFixed(2)}`,
    `$${dispositions.reduce((s, d) => s + d.outlays, 0).toFixed(2)}`,
    `$${dispositions.reduce((s, d) => s + d.rawGainLoss, 0).toFixed(2)}`,
    `$${dispositions.reduce((s, d) => s + d.allowedGainLoss, 0).toFixed(2)}`,
    `$${dispositions.reduce((s, d) => s + d.superficialLoss, 0).toFixed(2)}`,
  ]);

  autoTable(doc, {
    startY: y,
    head: [['Date', 'Symbol', 'Shares', 'Yr Acq', 'Proceeds', 'ACB', 'Outlays', 'Raw G/L', 'Claimable', 'SL Denied']],
    body: s3Body,
    styles: { fontSize: 7, cellPadding: 1.5 },
    headStyles: { fillColor: darkGreen, textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [245, 250, 248] },
    didParseCell: (data) => {
      // Highlight superficial loss rows
      if (data.section === 'body' && data.row.index < dispositions.length) {
        const d = dispositions[data.row.index];
        if (d.isSuperficialLoss) {
          data.cell.styles.fillColor = [255, 235, 235];
        }
        // Color the claimable column
        if (data.column.index === 8) {
          data.cell.styles.textColor = d.allowedGainLoss >= 0 ? medGreen : red;
          data.cell.styles.fontStyle = 'bold';
        }
      }
      // Bold total row
      if (data.section === 'body' && data.row.index === dispositions.length) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = lightGreen;
      }
    },
    margin: { left: margin, right: margin },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = ((doc as any).lastAutoTable?.finalY ?? y) + 8;

  // =======================================================================
  // Superficial Loss Details
  // =======================================================================
  const slForYear = superficialLosses.filter(sl => {
    const disp = dispositions.find(d => d.transaction.id === sl.dispositionId);
    return !!disp;
  });

  if (slForYear.length > 0) {
    ensureSpace(20 + slForYear.length * 12);
    sectionTitle('Superficial Loss Details', 'ITA Section 54 — Denied losses added to ACB of replacement shares');

    for (const sl of slForYear) {
      const disp = dispositions.find(d => d.transaction.id === sl.dispositionId);
      if (!disp) continue;

      ensureSpace(14);
      doc.setFontSize(8);
      doc.setTextColor(...darkGreen);
      doc.text(`${disp.transaction.symbol} — Sold ${sl.sharesSold} shares`, margin, y);
      y += 4;
      doc.setFontSize(7);
      doc.setTextColor(80);
      doc.text(
        `S=${sl.sharesSold}  P=${sl.sharesPurchasedInWindow}  B=${sl.sharesHeldAfter}  |  ` +
        `SL = min(${sl.sharesSold}, ${sl.sharesPurchasedInWindow}, ${sl.sharesHeldAfter}) / ${sl.sharesSold} × $${sl.totalLoss.toFixed(2)} = $${sl.deniedLoss.toFixed(2)} denied`,
        margin,
        y,
      );
      y += 6;
    }
    y += 4;
  }

  // =======================================================================
  // Securities Holdings
  // =======================================================================
  ensureSpace(30);
  sectionTitle('Securities Holdings', 'Current position after all transactions');

  const secBody: string[][] = [];
  const symbols = [...acbSnapshots.keys()].sort();
  for (const sym of symbols) {
    const rec = acbSnapshots.get(sym)!;
    if (rec.totalShares > 0 || rec.totalAcb > 0) {
      secBody.push([
        rec.symbol,
        rec.totalShares.toFixed(4),
        `$${rec.totalAcb.toFixed(2)}`,
        `$${rec.acbPerShare.toFixed(2)}`,
      ]);
    }
  }

  if (secBody.length > 0) {
    autoTable(doc, {
      startY: y,
      head: [['Symbol', 'Shares Held', 'Total ACB (CAD)', 'ACB/Share (CAD)']],
      body: secBody,
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: darkGreen, textColor: [255, 255, 255], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [245, 250, 248] },
      margin: { left: margin, right: margin },
      tableWidth: contentW * 0.6,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    y = ((doc as any).lastAutoTable?.finalY ?? y) + 8;
  }

  // =======================================================================
  // All Transactions
  // =======================================================================
  ensureSpace(30);
  sectionTitle('All Transactions', 'Complete buy/sell history');

  const sorted = [...transactions].sort((a, b) => a.settlementDate.getTime() - b.settlementDate.getTime());
  const txBody = sorted.map((t) => [
    format(t.settlementDate, 'yyyy-MM-dd'),
    t.action,
    t.symbol,
    t.quantity.toString(),
    `$${t.pricePerShare.toFixed(2)}`,
    t.currency,
    t.fxRate.toFixed(4),
    `$${t.pricePerShareCAD.toFixed(2)}`,
    `$${t.commission.toFixed(2)}`,
    `$${t.totalCAD.toFixed(2)}`,
  ]);

  autoTable(doc, {
    startY: y,
    head: [['Date', 'Action', 'Symbol', 'Qty', 'Price', 'Curr', 'FX Rate', 'Price CAD', 'Comm', 'Total CAD']],
    body: txBody,
    styles: { fontSize: 6.5, cellPadding: 1.2 },
    headStyles: { fillColor: darkGreen, textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [245, 250, 248] },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 1) {
        const action = sorted[data.row.index]?.action;
        data.cell.styles.textColor = action === 'BUY' ? medGreen : red;
        data.cell.styles.fontStyle = 'bold';
      }
    },
    margin: { left: margin, right: margin },
  });

  // Add footer to all pages
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    addFooter();
  }

  doc.save(`taxidermy-${taxYear}-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
}

// ---------------------------------------------------------------------------
// Legacy simple PDF (kept for backward compat but not used in UI anymore)
// ---------------------------------------------------------------------------

export function downloadPdf(
  dispositions: DispositionResult[],
  taxEstimate?: TaxEstimate,
  filename?: string
): void {
  // Redirect to full PDF
  downloadFullPdf(
    dispositions,
    [],
    new Map(),
    [],
    taxEstimate,
    new Date().getFullYear(),
  ).catch(() => {
    // Fallback: just save schedule 3
    const doc = generateSchedule3Pdf(dispositions, taxEstimate);
    doc.save(filename ?? `schedule3-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
  });
}

function generateSchedule3Pdf(
  dispositions: DispositionResult[],
  taxEstimate?: TaxEstimate
): jsPDF {
  const doc = new jsPDF({ orientation: 'landscape' });
  doc.setFontSize(16);
  doc.text('Schedule 3 - Capital Gains (or Losses)', 14, 20);
  doc.setFontSize(10);
  doc.text(`Generated: ${format(new Date(), 'MMMM d, yyyy')}`, 14, 28);

  const tableData = dispositions.map((d) => [
    `${d.transaction.quantity}`,
    `${d.transaction.symbol}`,
    d.yearOfAcquisition,
    `$${d.proceeds.toFixed(2)}`,
    `$${d.acbOfSharesSold.toFixed(2)}`,
    `$${d.outlays.toFixed(2)}`,
    `$${d.allowedGainLoss.toFixed(2)}`,
    d.isSuperficialLoss ? `*SL: $${d.superficialLoss.toFixed(2)}` : '',
  ]);

  autoTable(doc, {
    startY: 42,
    head: [['# of Shares', 'Description', 'Year Acquired', 'Proceeds', 'ACB', 'Outlays', 'Gain (Loss)', 'Notes']],
    body: tableData,
    styles: { fontSize: 8 },
    headStyles: { fillColor: [41, 65, 107] },
  });

  if (taxEstimate && taxEstimate.combinedTax > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const finalY = ((doc as any).lastAutoTable?.finalY ?? 120);
    doc.setFontSize(12);
    doc.text('Tax Estimate', 14, finalY + 15);
    doc.setFontSize(9);
    doc.text(`Taxable capital gains (50% inclusion): $${taxEstimate.taxableCapitalGains.toFixed(2)}`, 14, finalY + 24);
    doc.text(`Federal tax: $${taxEstimate.federalTax.toFixed(2)}`, 14, finalY + 31);
    doc.text(`Provincial tax (${taxEstimate.province}): $${taxEstimate.provincialTax.toFixed(2)}`, 14, finalY + 38);
    doc.text(`Combined estimated tax: $${taxEstimate.combinedTax.toFixed(2)}`, 14, finalY + 45);
  }

  return doc;
}

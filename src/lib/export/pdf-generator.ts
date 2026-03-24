import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { DispositionResult, TaxEstimate } from '@/types';
import { format } from 'date-fns';

export function generateSchedule3Pdf(
  dispositions: DispositionResult[],
  taxEstimate?: TaxEstimate
): jsPDF {
  const doc = new jsPDF({ orientation: 'landscape' });

  doc.setFontSize(16);
  doc.text('Schedule 3 - Capital Gains (or Losses)', 14, 20);
  doc.setFontSize(10);
  doc.text(`Generated: ${format(new Date(), 'MMMM d, yyyy')}`, 14, 28);

  doc.setFontSize(12);
  doc.text('Part 3 - Publicly traded shares, mutual fund units, and other securities', 14, 38);

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

  const totalProceeds = dispositions.reduce((s, d) => s + d.proceeds, 0);
  const totalAcb = dispositions.reduce((s, d) => s + d.acbOfSharesSold, 0);
  const totalOutlays = dispositions.reduce((s, d) => s + d.outlays, 0);
  const totalGainLoss = dispositions.reduce((s, d) => s + d.allowedGainLoss, 0);

  tableData.push([
    '',
    'TOTAL',
    '',
    `$${totalProceeds.toFixed(2)}`,
    `$${totalAcb.toFixed(2)}`,
    `$${totalOutlays.toFixed(2)}`,
    `$${totalGainLoss.toFixed(2)}`,
    '',
  ]);

  autoTable(doc, {
    startY: 42,
    head: [
      [
        '# of Shares',
        'Description',
        'Year Acquired',
        'Proceeds',
        'ACB',
        'Outlays',
        'Gain (Loss)',
        'Notes',
      ],
    ],
    body: tableData,
    styles: { fontSize: 8 },
    headStyles: { fillColor: [41, 65, 107] },
    foot: [],
  });

  if (taxEstimate && taxEstimate.combinedTax > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const finalY = ((doc as unknown as Record<string, unknown>).lastAutoTable as Record<string, number>)?.finalY ?? 120;
    doc.setFontSize(12);
    doc.text('Tax Estimate', 14, finalY + 15);
    doc.setFontSize(9);
    doc.text(`Taxable capital gains (50% inclusion): $${taxEstimate.taxableCapitalGains.toFixed(2)}`, 14, finalY + 24);
    doc.text(`Federal tax: $${taxEstimate.federalTax.toFixed(2)}`, 14, finalY + 31);
    doc.text(`Provincial tax (${taxEstimate.province}): $${taxEstimate.provincialTax.toFixed(2)}`, 14, finalY + 38);
    doc.text(`Combined estimated tax: $${taxEstimate.combinedTax.toFixed(2)}`, 14, finalY + 45);
    doc.text(`Effective tax rate on gains: ${(taxEstimate.effectiveRate * 100).toFixed(1)}%`, 14, finalY + 52);
  }

  // Superficial loss footnote
  const slDispositions = dispositions.filter((d) => d.isSuperficialLoss);
  if (slDispositions.length > 0) {
    doc.setFontSize(8);
    const noteY = doc.internal.pageSize.getHeight() - 20;
    doc.text(
      '*SL = Superficial loss denied under ITA Section 54. Denied amount added to ACB of remaining shares.',
      14,
      noteY
    );
  }

  return doc;
}

export function downloadPdf(
  dispositions: DispositionResult[],
  taxEstimate?: TaxEstimate,
  filename?: string
): void {
  const doc = generateSchedule3Pdf(dispositions, taxEstimate);
  doc.save(filename ?? `schedule3-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
}

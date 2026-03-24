import { NextResponse } from 'next/server';
// @ts-expect-error pdf-parse has no type declarations
import pdfParse from 'pdf-parse';

const MONTHS: Record<string, string> = {
  january: '01', february: '02', march: '03', april: '04',
  may: '05', june: '06', july: '07', august: '08',
  september: '09', october: '10', november: '11', december: '12',
  jan: '01', feb: '02', mar: '03', apr: '04',
  jun: '06', jul: '07', aug: '08', sep: '09',
  oct: '10', nov: '11', dec: '12',
};

/**
 * Normalize any common date string into YYYY-MM-DD.
 * Handles: MM/DD/YYYY, MM-DD-YYYY, YYYY-MM-DD, YYYY/MM/DD,
 * "January 15, 2025", "Jan 15, 2025", "15-Jan-2025", etc.
 */
function normalizeDate(raw: string): string {
  const s = raw.trim().replace(/,/g, '');

  // Already YYYY-MM-DD or YYYY/MM/DD
  const isoMatch = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2].padStart(2, '0')}-${isoMatch[3].padStart(2, '0')}`;
  }

  // MM/DD/YYYY or MM-DD-YYYY
  const mdyMatch = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (mdyMatch) {
    return `${mdyMatch[3]}-${mdyMatch[1].padStart(2, '0')}-${mdyMatch[2].padStart(2, '0')}`;
  }

  // MM-DD-YY (2-digit year)
  const mdyShort = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2})$/);
  if (mdyShort) {
    const yr = parseInt(mdyShort[3]) > 50 ? `19${mdyShort[3]}` : `20${mdyShort[3]}`;
    return `${yr}-${mdyShort[1].padStart(2, '0')}-${mdyShort[2].padStart(2, '0')}`;
  }

  // "January 15 2025" or "Jan 15 2025"
  const monthFirst = s.match(/^([A-Za-z]+)\s+(\d{1,2})\s+(\d{4})$/);
  if (monthFirst) {
    const mon = MONTHS[monthFirst[1].toLowerCase()];
    if (mon) return `${monthFirst[3]}-${mon}-${monthFirst[2].padStart(2, '0')}`;
  }

  // "15 January 2025" or "15-Jan-2025"
  const dayFirst = s.match(/^(\d{1,2})[\s\-]([A-Za-z]+)[\s\-](\d{4})$/);
  if (dayFirst) {
    const mon = MONTHS[dayFirst[2].toLowerCase()];
    if (mon) return `${dayFirst[3]}-${mon}-${dayFirst[1].padStart(2, '0')}`;
  }

  return s; // Return as-is if nothing matched
}
export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Call pdf-parse to extract raw text
    const data = await pdfParse(buffer);
    const rawText = data.text;

    // Normalize garbled no-space text from PDF extraction:
    // "E*TRADESecuritiesLLC" -> "E*TRADE Securities LLC"
    // Insert space before uppercase letters that follow lowercase letters
    // Insert space between letters and digits: "Quantity29" -> "Quantity 29"
    const text = rawText
      .replace(/([a-z])([A-Z])/g, '$1 $2')       // camelCase breaks
      .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')  // ACRONYMWord breaks
      .replace(/([a-zA-Z])(\d)/g, '$1 $2')         // letter->digit
      .replace(/(\d)([a-zA-Z])/g, '$1 $2')         // digit->letter
      .replace(/\s+/g, ' ');                        // collapse whitespace

    // Use heuristic RegExp parsing to find trade fields
    // Action
    let action = '';
    if (/(?:bought|buy|purchase|we\s*bought)/i.test(text) || /Shares?\s*Released/i.test(text) || /Plan\s*ESPP/i.test(text)) {
      action = 'BUY';
    } else if (/(?:sold|sell|we\s*sold)/i.test(text)) {
      action = 'SELL';
    }

    // Quantity
    let quantity = 0;
    const qtyPatterns = [
      /Shares?\s*Released[\s:]*([0-9,]+\.?[0-9]*)/i,
      /Shares?\s*Purchased[\s:]*([0-9,]+\.?[0-9]*)/i,
      /No\.?\s*of\s*Shares[\s:]*([0-9,]+\.?[0-9]*)/i,
      /Number\s*of\s*Shares[\s:]*([0-9,]+\.?[0-9]*)/i,
      /Total\s*Shares[\s:]*([0-9,]+\.?[0-9]*)/i,
      /(?:quantity|qty)[\s:]*([0-9,]+\.?[0-9]*)/i,
      /(?:sold|bought)\s+([0-9,]+\.?[0-9]*)\s*(?:shares?|shrs?)/i,
      /([0-9,]+\.?[0-9]*)\s+(?:shares?|shrs?)\b/i,
      // E*TRADE trade confirms: "WE SOLD 100 SQ"
      /we\s+(?:sold|bought)\s+([0-9,]+\.?[0-9]*)/i,
    ];
    for (const p of qtyPatterns) {
      const m = text.match(p);
      if (m) {
        const v = parseFloat(m[1].replace(/,/g, ''));
        if (v > 0) { quantity = v; break; }
      }
    }

    // Price
    let price = 0;
    const pricePatterns = [
      /Market\s*Value\s*Per\s*Share[\s:\$]*([0-9,]+\.[0-9]+)/i,
      /Purchase\s*Value\s*per\s*Share[\s:\$]*([0-9,]+\.[0-9]+)/i,
      /(?:price|prc|avg\.?\s*price)[\s:\$]*([0-9,]+\.[0-9]+)/i,
      /(?:@|at)\s*\$?\s*([0-9,]+\.[0-9]+)/i,
    ];
    for (const p of pricePatterns) {
      const m = text.match(p);
      if (m) { price = parseFloat(m[1].replace(/,/g, '')); break; }
    }

    // Date
    let date = '';
    const fileName = file.name;

    const datePatterns = [
      /(?:Release\s*Date|Purchase\s*Date|Trade\s*Date|Settlement\s*Date)[\s:]*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i,
      /(?:Release\s*Date|Purchase\s*Date|Trade\s*Date|Settlement\s*Date)[\s:]*((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4})/i,
      /(?:Release\s*Date|Purchase\s*Date|Trade\s*Date|Settlement\s*Date)[\s:]*((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4})/i,
      /(?:Release\s*Date|Purchase\s*Date|Trade\s*Date|Settlement\s*Date)[\s:]*(\d{1,2}[\-\s](?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[\-\s]\d{4})/i,
      /(?:Release\s*Date|Purchase\s*Date|Trade\s*Date|Settlement\s*Date)[\s:]*(\d{4}[\-\/]\d{1,2}[\-\/]\d{1,2})/i,
      /(\d{1,2}\/\d{1,2}\/\d{4})/,
      /((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4})/,
    ];

    for (const pattern of datePatterns) {
      const m = text.match(pattern);
      if (m) { date = m[1].trim(); break; }
    }

    // Fallback: extract date from filename (e.g. "TradeConfirmations_1584_040323.pdf" -> 04/03/23)
    if (!date) {
      const fnDateMatch = fileName.match(/(\d{1,2}[\-\/]\d{1,2}[\-\/]\d{2,4})/);
      if (fnDateMatch) {
        date = fnDateMatch[1];
      } else {
        // Try "MMDDYY" pattern from filename like "_040323" 
        const compactMatch = fileName.match(/_(\d{6})(?:_\d+)?\.pdf$/i);
        if (compactMatch) {
          const d = compactMatch[1]; // e.g. "040323"
          date = `${d.substring(0,2)}/${d.substring(2,4)}/${d.substring(4,6)}`;
        }
      }
    }

    if (date) {
      date = normalizeDate(date);
    }

    // Symbol
    let symbol = '';
    const symPatterns = [
      /(?:symbol|ticker|security)[\s:]*([A-Z]{1,5})\b/i,
      /we\s+(?:sold|bought)\s+\d[\d,.]*\s+([A-Z]{1,5})\b/i,
    ];
    for (const p of symPatterns) {
      const m = text.match(p);
      if (m) { symbol = m[1].toUpperCase(); break; }
    }
    if (!symbol) symbol = 'UNKNOWN';

    // Currency
    let currency = 'CAD';
    if (/(?:USD|U\.?\s*S\.?)/i.test(text) || /E\s*\*\s*TRADE/i.test(text) || /Morgan\s*Stanley/i.test(text)) currency = 'USD';

    // Build a useful preview: skip boilerplate, find first occurrence of a keyword
    const keywords = ['sold', 'bought', 'trade', 'quantity', 'shares', 'price', 'settlement'];
    let previewStart = 0;
    const lowerText = text.toLowerCase();
    for (const kw of keywords) {
      const idx = lowerText.indexOf(kw);
      if (idx > 0) { previewStart = Math.max(0, idx - 30); break; }
    }

    return NextResponse.json({
      textPreview: text.substring(previewStart, previewStart + 500),
      transaction: {
        action,
        date,
        symbol,
        quantity,
        price,
        currency,
        commission: 0,
      }
    });
  } catch (error: any) {
    console.error('PDF Parse Error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to parse PDF' },
      { status: 500 }
    );
  }
}

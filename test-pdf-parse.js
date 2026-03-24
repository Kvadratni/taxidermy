const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');

const dir = process.argv[2] || path.join(process.env.HOME, 'Downloads/confirmations');
const files = fs.readdirSync(dir).filter(f => f.toLowerCase().endsWith('.pdf')).slice(0, 10);

console.log(`Testing ${files.length} PDFs from ${dir}\n`);

(async () => {
  for (const file of files) {
    const filePath = path.join(dir, file);
    console.log(`=== ${file} ===`);
    try {
      const buffer = fs.readFileSync(filePath);
      const data = await pdfParse(buffer);
      const rawText = data.text;
      
      const text = rawText
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
        .replace(/([a-zA-Z])(\d)/g, '$1 $2')
        .replace(/(\d)([a-zA-Z])/g, '$1 $2')
        .replace(/\s+/g, ' ');

      const keywords = ['sold', 'bought', 'trade', 'quantity', 'shares', 'price', 'settlement', 'released'];
      let relevantSnippet = '';
      const lower = text.toLowerCase();
      for (const kw of keywords) {
        const idx = lower.indexOf(kw);
        if (idx > 0) {
          relevantSnippet = text.substring(Math.max(0, idx - 50), idx + 300);
          break;
        }
      }

      let quantity = 0;
      const qtyPatterns = [
        { name: 'Shares Released', re: /Shares?\s*Released[\s:]*([0-9,]+\.?[0-9]*)/i },
        { name: 'Shares Purchased', re: /Shares?\s*Purchased[\s:]*([0-9,]+\.?[0-9]*)/i },
        { name: 'No of Shares', re: /No\.?\s*of\s*Shares[\s:]*([0-9,]+\.?[0-9]*)/i },
        { name: 'Quantity', re: /(?:quantity|qty)[\s:]*([0-9,]+\.?[0-9]*)/i },
        { name: 'sold/bought N shares', re: /(?:sold|bought)\s+([0-9,]+\.?[0-9]*)\s*(?:shares?|shrs?)/i },
        { name: 'N shares', re: /([0-9,]+\.?[0-9]*)\s+(?:shares?|shrs?)\b/i },
        { name: 'WE SOLD N', re: /we\s+(?:sold|bought)\s+([0-9,]+\.?[0-9]*)/i },
      ];
      for (const { name, re } of qtyPatterns) {
        const m = text.match(re);
        if (m) {
          const v = parseFloat(m[1].replace(/,/g, ''));
          if (v > 0) { 
            quantity = v; 
            console.log(`  ✅ Qty matched by: "${name}" -> ${v}`);
            break; 
          }
        }
      }
      if (quantity === 0) {
        console.log('  ❌ NO QUANTITY FOUND');
        console.log(`  Raw text (first 200): "${rawText.substring(0, 200)}"`);
        console.log(`  Normalized relevant: "${relevantSnippet.substring(0, 300)}"`);
      }
      console.log();
    } catch (err) {
      console.log(`  ❌ PARSE ERROR: ${err.message}\n`);
    }
  }
})();

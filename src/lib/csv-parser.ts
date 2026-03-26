/**
 * Local CSV parser — replaces papaparse to reduce supply chain risk.
 * Implements RFC 4180 parsing (quoted fields, embedded commas/newlines).
 */

export function parseCsvText(text: string): string[][] {
  const rows: string[][] = [];
  let i = 0;
  const len = text.length;

  while (i < len) {
    const row: string[] = [];

    while (i < len) {
      let field = '';

      if (text[i] === '"') {
        // Quoted field
        i++; // skip opening quote
        while (i < len) {
          if (text[i] === '"') {
            if (i + 1 < len && text[i + 1] === '"') {
              // Escaped quote
              field += '"';
              i += 2;
            } else {
              // End of quoted field
              i++; // skip closing quote
              break;
            }
          } else {
            field += text[i];
            i++;
          }
        }
      } else {
        // Unquoted field
        while (i < len && text[i] !== ',' && text[i] !== '\n' && text[i] !== '\r') {
          field += text[i];
          i++;
        }
      }

      row.push(field);

      if (i < len && text[i] === ',') {
        i++; // skip comma, continue to next field
      } else {
        // End of row (newline or end of text)
        break;
      }
    }

    // Skip \r\n or \n
    if (i < len && text[i] === '\r') i++;
    if (i < len && text[i] === '\n') i++;

    // Skip empty rows
    if (row.length === 1 && row[0] === '') continue;

    rows.push(row);
  }

  return rows;
}

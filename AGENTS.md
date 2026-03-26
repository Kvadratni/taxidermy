<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Dependency philosophy: fewer packages, smaller attack surface

This project deliberately minimizes npm dependencies to reduce supply chain risk. Before adding a new package, check whether the functionality can be implemented locally in a few hundred lines of code. The following were replaced with local implementations:

| Replaced package | Local implementation | Notes |
|---|---|---|
| `date-fns` | `src/lib/date-utils.ts` | Date formatting, parsing, arithmetic |
| `papaparse` | `src/lib/csv-parser.ts` | RFC 4180 CSV parser (~60 lines) |
| `xlsx` (SheetJS) | `src/lib/xlsx-local.ts` + `src/lib/zip.ts` | XLSX read/write via ZIP + XML; uses browser `DecompressionStream` |
| `uuid` | `crypto.randomUUID()` | Native browser API, no package needed |
| `pdf-parse` | removed (was redundant) | `pdfjs-dist` already handles PDF extraction client-side |

**When to add a dependency:** If the package handles a genuinely complex spec (PDF rendering, TLS, compression codecs) or is actively maintained against security-critical edge cases that a local implementation would miss. If the functionality is a thin wrapper around a web API or a straightforward algorithm, implement it locally.

**When modifying local implementations:** These files have no upstream — bugs must be fixed in-tree. If you change `zip.ts`, `xlsx-local.ts`, `csv-parser.ts`, or `date-utils.ts`, verify with `npm run build` and manual testing.

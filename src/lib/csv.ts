// The one CSV reader/writer, lifted out of admin/question-bank/actions.ts where
// it was private to a "use server" file and so untestable. Two fixes over the
// original: a BOM is stripped (our own export emits one, and Sheets adds one, so
// a round-trip lost its first header), and rows can be keyed by header.

/** Parse CSV text into a grid. Handles quoted fields, escaped `""`, embedded
 *  newlines, CRLF, and a leading BOM. Fully blank lines are dropped. */
export function parseCsvGrid(text: string): string[][] {
  const src = stripBom(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQ = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQ) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else inQ = false;
      } else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c !== "\r") field += c;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

/** A row keyed by header, carrying the 1-based data-row number for tracing. */
export type CsvRow = Record<string, string> & { __row: number };

/** Key each data row by header. Duplicate headers get a `__2`, `__3`, … suffix
 *  rather than silently shadowing each other. Missing trailing cells read as "". */
export function gridToObjects(grid: string[][]): CsvRow[] {
  if (grid.length < 2) return [];
  const seen = new Map<string, number>();
  const header = grid[0].map((h) => {
    const key = h.trim();
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    return n === 1 ? key : `${key}__${n}`;
  });
  return grid.slice(1).map((cells, i) => {
    const out = { __row: i + 1 } as CsvRow;
    header.forEach((h, c) => {
      out[h] = cells[c] ?? "";
    });
    return out;
  });
}

export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

export type CsvCell = string | number | null | undefined;

/** `formulaGuard` wraps the value in `="…"` so a spreadsheet keeps leading
 *  zeros — never for a file another program parses, which ingests it literally. */
export function csvCell(value: CsvCell, formulaGuard = false): string {
  const s = value == null ? "" : String(value);
  if (formulaGuard && s !== "") return `"=""${s.replace(/"/g, "")}"""`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Text a member of the public typed, made inert for a spreadsheet: a leading
 *  = + - @ or control character would otherwise run as a formula (CSV injection). */
export function inertText(value: string | null | undefined): string {
  const s = value ?? "";
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}

/** Serialize a matrix. `bom` for files a human opens in Excel/Sheets; omit it
 *  for files another program parses. Rows are CRLF-joined per RFC 4180. */
export function toCsv(
  matrix: CsvCell[][],
  opts: { bom?: boolean; formulaGuardColumns?: ReadonlySet<number> } = {},
): string {
  const guard = opts.formulaGuardColumns;
  const body = matrix
    .map((row, r) =>
      row.map((cell, c) => csvCell(cell, r > 0 && !!guard?.has(c))).join(","),
    )
    .join("\r\n");
  return opts.bom ? `﻿${body}` : body;
}

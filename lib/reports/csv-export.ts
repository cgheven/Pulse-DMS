import type { ReportColumn } from "./types";

function esc(v: string | number): string {
  let s = typeof v === "number" ? String(v) : (v ?? "");
  // CSV/formula-injection guard: a cell value sourced from user-controlled
  // text (e.g. a rider- or client-supplied name/note) that starts with
  // =, +, -, or @ would be interpreted as a formula by Excel/Sheets when the
  // exported file is opened. Prefix with a leading apostrophe so it's always
  // treated as literal text — matches the standard OWASP CSV-injection fix.
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
}

export function downloadReportCsv<Row>(opts: {
  filename: string;
  columns: ReportColumn<Row>[];
  rows: Row[];
  totalsRow?: boolean;
}): void {
  const { filename, columns, rows, totalsRow } = opts;
  const header = columns.map((c) => esc(c.label)).join(",");
  const body = rows.map((row) => columns.map((c) => esc(c.accessor(row))).join(","));
  if (totalsRow) {
    body.push(
      columns.map((c, i) => {
        if (!c.numeric) return i === 0 ? esc("Total") : esc("");
        const sum = rows.reduce((a, r) => {
          const v = c.accessor(r);
          return a + (typeof v === "number" ? v : Number(v) || 0);
        }, 0);
        return esc(new Intl.NumberFormat("en-PK").format(sum));
      }).join(",")
    );
  }
  const csv = "﻿" + [header, ...body].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : filename + ".csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

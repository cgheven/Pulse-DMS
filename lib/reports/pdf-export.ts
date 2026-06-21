import type { ReportColumn } from "./types";

export type PdfMeta = { title: string; shopName: string; period?: string; filename: string; };

export async function downloadReportPdf<Row>(opts: {
  meta: PdfMeta;
  columns: ReportColumn<Row>[];
  rows: Row[];
  totalsRow?: boolean;
}): Promise<void> {
  const { meta, columns, rows, totalsRow } = opts;
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const INK: [number, number, number] = [15, 23, 42];
  const MUTED: [number, number, number] = [100, 116, 139];
  const RULE: [number, number, number] = [215, 215, 222];
  const HEAD_BG: [number, number, number] = [248, 250, 252];
  const W = doc.internal.pageSize.getWidth();
  const M = 14;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(...INK);
  doc.text(meta.title, M, 18);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text(meta.shopName, M, 25);
  if (meta.period) doc.text(meta.period, M, 30);
  const now = new Date().toLocaleString("en-PK", { timeZone: "Asia/Karachi" });
  doc.text("Generated: " + now, W - M, 25, { align: "right" });
  doc.setDrawColor(...RULE);
  doc.setLineWidth(0.3);
  doc.line(M, 33, W - M, 33);
  const head = [columns.map((c) => c.label)];
  const body = rows.map((row) =>
    columns.map((c) => {
      const v = c.accessor(row);
      return typeof v === "number" ? new Intl.NumberFormat("en-PK").format(v) : String(v ?? "");
    })
  );
  if (totalsRow) {
    body.push(columns.map((c, i) => {
      if (!c.numeric) return i === 0 ? "Total" : "";
      const sum = rows.reduce((a, r) => {
        const v = c.accessor(r);
        return a + (typeof v === "number" ? v : Number(v) || 0);
      }, 0);
      return new Intl.NumberFormat("en-PK").format(sum);
    }));
  }
  autoTable(doc, {
    head,
    body,
    startY: 37,
    margin: { left: M, right: M },
    styles: { fontSize: 8, cellPadding: 2.5, textColor: INK, lineColor: RULE, lineWidth: 0.2 },
    headStyles: { fillColor: HEAD_BG, textColor: INK, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [252, 252, 253] },
    didParseCell: (data: any) => {
      if (columns[data.column.index]?.numeric) data.cell.styles.halign = "right";
      if (totalsRow && data.row.index === body.length - 1) {
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.fillColor = [241, 245, 249];
      }
    },
    didDrawPage: (data: any) => {
      const total = doc.getNumberOfPages();
      const cur = doc.getCurrentPageInfo().pageNumber;
      doc.setFontSize(7);
      doc.setTextColor(...MUTED);
      doc.text("Page " + cur + " of " + total, W / 2, doc.internal.pageSize.getHeight() - 8, { align: "center" });
    },
  });
  doc.save(meta.filename.endsWith(".pdf") ? meta.filename : meta.filename + ".pdf");
}

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { hexToRgb, loadCompanyLogo, savePdf, type LoadedLogo } from "@/lib/pdf";
import type { CompanySettings } from "@/lib/company";

export type ReportColumn = { header: string; align?: "left" | "right" | "center"; width?: number };

export type ReportTable = {
  title: string;
  subtitle?: string;
  columns: ReportColumn[];
  rows: (string | number)[][];
  totalsRow?: (string | number)[];
};

export function toCsv(columns: ReportColumn[], rows: (string | number)[][]) {
  const esc = (v: string | number) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [columns.map((c) => esc(c.header)).join(","), ...rows.map((r) => r.map(esc).join(","))].join("\n");
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function generateReportPdf(
  report: ReportTable,
  company: CompanySettings,
  logo: LoadedLogo | null = null,
): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const accent = hexToRgb(company.brand_color);
  const M = 14;

  // Header band
  doc.setFillColor(accent[0], accent[1], accent[2]);
  doc.rect(0, 0, W, 26, "F");
  if (logo) {
    try {
      doc.addImage(logo.dataUrl, logo.format, M, 4, 18, 18, undefined, "FAST");
    } catch { /* ignore bad logo */ }
  }
  const textX = logo ? M + 22 : M;
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(company.company_name || "Company", textX, 12);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  const meta = [company.address, company.city, company.phone, company.email].filter(Boolean).join(" · ");
  if (meta) doc.text(meta, textX, 18, { maxWidth: W - textX - M });

  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text(report.title, M, 38);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  if (report.subtitle) doc.text(report.subtitle, M, 44);
  doc.text(`Generated ${new Date().toLocaleString()}`, W - M, 44, { align: "right" });

  const columnStyles: Record<number, { halign: "left" | "right" | "center"; cellWidth?: number }> = {};
  report.columns.forEach((c, i) => {
    columnStyles[i] = { halign: c.align ?? "left", ...(c.width ? { cellWidth: c.width } : {}) };
  });

  autoTable(doc, {
    startY: 50,
    head: [report.columns.map((c) => c.header)],
    body: report.rows.map((r) => r.map((v) => String(v))),
    foot: report.totalsRow ? [report.totalsRow.map((v) => String(v))] : undefined,
    theme: "striped",
    headStyles: { fillColor: accent, textColor: 255, fontStyle: "bold" },
    footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: "bold" },
    styles: { font: "helvetica", fontSize: 9.5, cellPadding: 2.6, overflow: "linebreak", valign: "middle", lineColor: [226, 232, 240] },
    columnStyles,
    margin: { left: M, right: M, bottom: 18 },
    didParseCell: (d) => {
      if (d.section === "head" || d.section === "foot") {
        d.cell.styles.halign = report.columns[d.column.index]?.align ?? "left";
      }
    },
  });

  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    const H = doc.internal.pageSize.getHeight();
    doc.setDrawColor(226, 232, 240);
    doc.line(M, H - 12, W - M, H - 12);
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(company.company_name || "", M, H - 7);
    doc.text(`Page ${p} of ${pages}`, W - M, H - 7, { align: "right" });
  }

  return doc;
}

export async function downloadReportPdf(report: ReportTable, company: CompanySettings, filename: string) {
  const logo = await loadCompanyLogo(company).catch(() => null);
  const doc = generateReportPdf(report, company, logo);
  await savePdf(doc, filename);
}

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { CompanySettings } from "./company";

export type InvoicePdfData = {
  number: string;
  date: string;
  dueDate?: string | null;
  status: string;
  customer: {
    name: string;
    company?: string | null;
    email?: string | null;
    phone?: string | null;
    address?: string | null;
    tax_id?: string | null;
  };
  items: { description: string; quantity: number; unit_price: number; line_total: number }[];
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  discount: number;
  total: number;
  amountPaid: number;
  balance: number;
  notes?: string | null;
  template?: string;
};

export type ReceiptPdfData = {
  number: string;
  date: string;
  invoiceNumber?: string | null;
  customer: { name: string; company?: string | null; email?: string | null };
  amount: number;
  method: string;
  template?: string;
};

const money = (n: number, sym = "USh ") =>
  `${sym}${(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export type LoadedLogo = { dataUrl: string; format: "PNG" | "JPEG" };

export async function loadLogoDataUrl(url: string | null | undefined): Promise<LoadedLogo | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) return null;
    const blob = await res.blob();
    const format: "PNG" | "JPEG" = /png/i.test(blob.type) ? "PNG" : "JPEG";
    const dataUrl: string = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = () => reject(r.error);
      r.readAsDataURL(blob);
    });
    return { dataUrl, format };
  } catch (e) {
    console.warn("Logo fetch failed", e);
    return null;
  }
}

function drawLogo(doc: jsPDF, logo: LoadedLogo | null, x: number, y: number, w: number, h: number) {
  if (!logo) return;
  try {
    doc.addImage(logo.dataUrl, logo.format, x, y, w, h, undefined, "FAST");
  } catch (e) {
    console.warn("addImage failed", e);
  }
}

/** Cross-platform PDF save that also works in mobile in-app WebViews. */
export function savePdf(doc: jsPDF, filename: string) {
  try {
    doc.save(filename);
  } catch (e) {
    console.warn("doc.save failed, falling back to blob url", e);
    const blob = doc.output("blob");
    const url = URL.createObjectURL(blob);
    const w = window.open(url, "_blank");
    if (!w) window.location.href = url;
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}

function headerClassic(doc: jsPDF, company: CompanySettings, title: string, number: string, logo: LoadedLogo | null) {
  // Emerald top band
  doc.setFillColor(11, 110, 79);
  doc.rect(0, 0, 210, 28, "F");
  const nameX = logo ? 34 : 14;
  if (logo) drawLogo(doc, logo, 14, 4, 18, 18);
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text(company.company_name, nameX, 14);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text([company.address, [company.city, company.country].filter(Boolean).join(", ")].filter(Boolean).join("  •  "), nameX, 21);

  doc.setTextColor(31, 41, 55);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(26);
  doc.text(title.toUpperCase(), 196, 18, { align: "right" });
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text(`# ${number}`, 196, 25, { align: "right" });
}

function headerModern(doc: jsPDF, company: CompanySettings, title: string, number: string, logo: LoadedLogo | null) {
  // Left accent bar
  doc.setFillColor(245, 158, 11);
  doc.rect(0, 0, 6, 297, "F");
  doc.setTextColor(31, 41, 55);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(28);
  doc.text(title.toUpperCase(), 14, 22);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 116, 139);
  doc.text(`# ${number}`, 14, 28);

  if (logo) drawLogo(doc, logo, 174, 8, 22, 22);
  doc.setTextColor(11, 110, 79);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  const rightY = logo ? 34 : 18;
  doc.text(company.company_name, 196, rightY, { align: "right" });
  doc.setTextColor(100, 116, 139);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const lines = [company.email, company.phone, company.address].filter(Boolean) as string[];
  lines.forEach((l, i) => doc.text(l, 196, rightY + 6 + i * 4, { align: "right" }));
}

export function generateInvoicePdf(data: InvoicePdfData, company: CompanySettings, logo: LoadedLogo | null = null): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const template = data.template || company.invoice_template || "classic";
  if (template === "modern") headerModern(doc, company, "Invoice", data.number, logo);
  else headerClassic(doc, company, "Invoice", data.number, logo);

  const startY = template === "modern" ? 44 : 38;
  // Bill To + Meta
  doc.setTextColor(100, 116, 139);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("BILL TO", 14, startY);
  doc.text("INVOICE DATE", 130, startY);
  doc.text("DUE DATE", 170, startY);

  doc.setTextColor(31, 41, 55);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(data.customer.company || data.customer.name, 14, startY + 6);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const custLines = [
    data.customer.company ? data.customer.name : null,
    data.customer.address,
    data.customer.email,
    data.customer.phone,
    data.customer.tax_id ? `Tax ID: ${data.customer.tax_id}` : null,
  ].filter(Boolean) as string[];
  custLines.forEach((l, i) => doc.text(l, 14, startY + 11 + i * 4));

  doc.setFontSize(10);
  doc.text(data.date, 130, startY + 6);
  doc.text(data.dueDate || "—", 170, startY + 6);

  // Items
  autoTable(doc, {
    startY: startY + 36,
    head: [["Description", "Qty", "Unit Price", "Amount"]],
    body: data.items.map((it) => [
      it.description,
      String(it.quantity),
      money(it.unit_price, company.currency_symbol),
      money(it.line_total, company.currency_symbol),
    ]),
    theme: "striped",
    headStyles: { fillColor: [11, 110, 79], textColor: 255, fontStyle: "bold" },
    styles: { font: "helvetica", fontSize: 10, cellPadding: 3 },
    columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" } },
    margin: { left: 14, right: 14 },
  });

  // Totals box
  const finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
  const xLabel = 130, xVal = 196;
  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139);
  doc.text("Subtotal", xLabel, finalY);
  doc.setTextColor(31, 41, 55);
  doc.text(money(data.subtotal, company.currency_symbol), xVal, finalY, { align: "right" });

  let y = finalY + 6;
  if (data.discount > 0) {
    doc.setTextColor(100, 116, 139);
    doc.text("Discount", xLabel, y);
    doc.setTextColor(31, 41, 55);
    doc.text(`- ${money(data.discount, company.currency_symbol)}`, xVal, y, { align: "right" });
    y += 6;
  }
  if (data.taxAmount > 0) {
    doc.setTextColor(100, 116, 139);
    doc.text(`Tax (${data.taxRate}%)`, xLabel, y);
    doc.setTextColor(31, 41, 55);
    doc.text(money(data.taxAmount, company.currency_symbol), xVal, y, { align: "right" });
    y += 6;
  }
  // Total band
  doc.setFillColor(11, 110, 79);
  doc.rect(xLabel - 4, y - 4, 70, 10, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.text("TOTAL", xLabel, y + 2);
  doc.text(money(data.total, company.currency_symbol), xVal, y + 2, { align: "right" });
  y += 10;

  if (data.amountPaid > 0) {
    doc.setTextColor(100, 116, 139);
    doc.setFont("helvetica", "normal");
    doc.text("Amount Paid", xLabel, y + 4);
    doc.setTextColor(31, 41, 55);
    doc.text(money(data.amountPaid, company.currency_symbol), xVal, y + 4, { align: "right" });
    y += 6;
    doc.setTextColor(245, 158, 11);
    doc.setFont("helvetica", "bold");
    doc.text("Balance Due", xLabel, y + 4);
    doc.text(money(data.balance, company.currency_symbol), xVal, y + 4, { align: "right" });
  }

  // Footer
  let fy = 270;
  if (data.notes) {
    doc.setTextColor(100, 116, 139);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("NOTES", 14, fy);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(31, 41, 55);
    doc.text(doc.splitTextToSize(data.notes, 110), 14, fy + 4);
  }
  if (company.payment_instructions) {
    doc.setTextColor(100, 116, 139);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("PAYMENT INSTRUCTIONS", 130, fy);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(31, 41, 55);
    doc.text(doc.splitTextToSize(company.payment_instructions, 70), 130, fy + 4);
  }
  doc.setTextColor(100, 116, 139);
  doc.setFontSize(8);
  doc.text(company.invoice_footer || "Thank you for your business.", 105, 290, { align: "center" });

  return doc;
}

export function generateReceiptPdf(data: ReceiptPdfData, company: CompanySettings, logo: LoadedLogo | null = null): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const template = data.template || company.receipt_template || "classic";
  if (template === "modern") headerModern(doc, company, "Receipt", data.number, logo);
  else headerClassic(doc, company, "Receipt", data.number, logo);

  const y = template === "modern" ? 50 : 44;
  doc.setTextColor(100, 116, 139);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("RECEIVED FROM", 14, y);
  doc.text("DATE", 130, y);
  doc.text("PAYMENT METHOD", 170, y);

  doc.setTextColor(31, 41, 55);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(data.customer.company || data.customer.name, 14, y + 6);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(data.date, 130, y + 6);
  doc.text(data.method.replace(/_/g, " "), 170, y + 6);

  // Amount box
  doc.setFillColor(245, 243, 238);
  doc.rect(14, y + 22, 182, 30, "F");
  doc.setTextColor(100, 116, 139);
  doc.setFontSize(10);
  doc.text("AMOUNT RECEIVED", 20, y + 32);
  doc.setTextColor(11, 110, 79);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(28);
  doc.text(money(data.amount, company.currency_symbol), 190, y + 44, { align: "right" });

  if (data.invoiceNumber) {
    doc.setTextColor(100, 116, 139);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Payment for invoice ${data.invoiceNumber}`, 14, y + 62);
  }

  doc.setTextColor(100, 116, 139);
  doc.setFontSize(8);
  doc.text(company.invoice_footer || "Thank you for your payment.", 105, 290, { align: "center" });
  return doc;
}

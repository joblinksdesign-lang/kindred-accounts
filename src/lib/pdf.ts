import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { CompanySettings } from "./company";
import { supabase } from "@/integrations/supabase/client";

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
  items?: { description: string; quantity: number; unit_price: number; line_total: number }[];
  subtotal?: number;
  taxAmount?: number;
  discount?: number;
  cashier?: string | null;
};


const money = (n: number, sym = "USh ") =>
  `${sym}${(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export type LoadedLogo = { dataUrl: string; format: "PNG" | "JPEG" };

const blobToDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });

const imageBlobToPngDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth || 256;
        canvas.height = img.naturalHeight || 256;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("canvas ctx unavailable");
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL("image/png"));
      } catch (err) {
        reject(err);
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(objectUrl);
      reject(err);
    };
    img.src = objectUrl;
  });

export async function loadLogoDataUrl(url: string | null | undefined): Promise<LoadedLogo | null> {
  if (!url) return null;
  // Strategy 1 — direct fetch (works for CORS-enabled buckets)
  try {
    const res = await fetch(url, { mode: "cors", cache: "no-cache" });
    if (res.ok) {
      const blob = await res.blob();
      if (/jpe?g/i.test(blob.type)) return { dataUrl: await blobToDataUrl(blob), format: "JPEG" };
      if (/png/i.test(blob.type)) return { dataUrl: await blobToDataUrl(blob), format: "PNG" };
      return { dataUrl: await imageBlobToPngDataUrl(blob), format: "PNG" };
    }
  } catch (e) {
    console.warn("Logo fetch failed, trying <img> fallback", e);
  }
  // Strategy 2 — load via <img crossOrigin=anonymous> and canvas
  try {
    const dataUrl: string = await new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = img.naturalWidth || 256;
          canvas.height = img.naturalHeight || 256;
          const ctx = canvas.getContext("2d");
          if (!ctx) return reject(new Error("canvas ctx unavailable"));
          ctx.drawImage(img, 0, 0);
          resolve(canvas.toDataURL("image/png"));
        } catch (err) { reject(err); }
      };
      img.onerror = (err) => reject(err);
      img.src = url + (url.includes("?") ? "&" : "?") + "t=" + Date.now();
    });
    return { dataUrl, format: "PNG" };
  } catch (e) {
    console.warn("Logo <img> fallback failed", e);
    return null;
  }
}

export async function loadCompanyLogo(company: CompanySettings): Promise<LoadedLogo | null> {
  if (company.logo_path) {
    const { data, error } = await supabase.storage
      .from("company-assets")
      .createSignedUrl(company.logo_path, 60 * 60);
    if (!error && data?.signedUrl) {
      const storedLogo = await loadLogoDataUrl(data.signedUrl);
      if (storedLogo) return storedLogo;
    }
  }
  return loadLogoDataUrl(company.logo_url);
}

function drawLogo(doc: jsPDF, logo: LoadedLogo | null, x: number, y: number, w: number, h: number) {
  if (!logo) return;
  try {
    doc.addImage(logo.dataUrl, logo.format, x, y, w, h, undefined, "FAST");
  } catch (e) {
    console.warn("addImage failed", e);
  }
}

function drawWatermark(doc: jsPDF, logo: LoadedLogo | null, pageWidth = 210, pageHeight = 297) {
  if (!logo) return;
  const anyDoc = doc as jsPDF & { GState?: new (opts: { opacity: number }) => unknown; setGState?: (state: unknown) => void };
  try {
    if (anyDoc.GState && anyDoc.setGState) anyDoc.setGState(new anyDoc.GState({ opacity: 0.055 }));
    drawLogo(doc, logo, (pageWidth - 92) / 2, (pageHeight - 92) / 2, 92, 92);
    if (anyDoc.GState && anyDoc.setGState) anyDoc.setGState(new anyDoc.GState({ opacity: 1 }));
  } catch (e) {
    console.warn("watermark failed", e);
  }
}

function isMobile() {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod|Mobile|webOS|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent,
  );
}

/** Cross-platform PDF save that also works in mobile in-app WebViews.
 *  On mobile, triggers a real anchor download so the OS shows its
 *  download UI (folder chooser / "open with" / share sheet). If the
 *  Web Share API supports files, it also offers the native share sheet
 *  so users can pick "Save to Files", "Drive", etc. */
export async function savePdf(doc: jsPDF, filename: string) {
  const blob = doc.output("blob");
  const file = new File([blob], filename, { type: "application/pdf" });

  // Mobile: prefer native share sheet (lets user save to Files / Drive / print)
  try {
    const nav = navigator as Navigator & {
      canShare?: (d: { files: File[] }) => boolean;
      share?: (d: { files: File[]; title?: string }) => Promise<void>;
    };
    if (isMobile() && nav.canShare?.({ files: [file] }) && nav.share) {
      await nav.share({ files: [file], title: filename });
      return;
    }
  } catch (e) {
    console.warn("share failed, falling back to download", e);
  }

  // Standard anchor download — browser shows its native download / save UI
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return;
  } catch (e) {
    console.warn("anchor download failed, falling back to doc.save", e);
  }

  try {
    doc.save(filename);
  } catch (e) {
    console.warn("doc.save failed, opening blob url", e);
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
  drawWatermark(doc, logo);
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
    styles: { font: "helvetica", fontSize: 10, cellPadding: 3, overflow: "linebreak", valign: "middle" },
    columnStyles: {
      0: { halign: "left", cellWidth: "auto" },
      1: { halign: "right", cellWidth: 20 },
      2: { halign: "right", cellWidth: 34 },
      3: { halign: "right", cellWidth: 34 },
    },
    didParseCell: (d) => { if (d.section === "head" && d.column.index > 0) d.cell.styles.halign = "right"; },
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
  drawWatermark(doc, logo);
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

  let cursorY = y + 22;
  // Items table (products purchased)
  const items = data.items ?? [];
  if (items.length) {
    autoTable(doc, {
      startY: cursorY,
      head: [["Description", "Qty", "Unit Price", "Amount"]],
      body: items.map((it) => [
        it.description,
        String(it.quantity),
        money(it.unit_price, company.currency_symbol),
        money(it.line_total, company.currency_symbol),
      ]),
      theme: "striped",
      headStyles: { fillColor: [11, 110, 79], textColor: 255, fontStyle: "bold" },
      styles: { font: "helvetica", fontSize: 10, cellPadding: 3, overflow: "linebreak", valign: "middle" },
      columnStyles: {
        0: { halign: "left", cellWidth: "auto" },
        1: { halign: "right", cellWidth: 20 },
        2: { halign: "right", cellWidth: 34 },
        3: { halign: "right", cellWidth: 34 },
      },
      didParseCell: (d) => { if (d.section === "head" && d.column.index > 0) d.cell.styles.halign = "right"; },
      margin: { left: 14, right: 14 },
    });
    cursorY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;

    // Sub-totals
    const xLabel = 130, xVal = 196;
    doc.setFontSize(10);
    if (typeof data.subtotal === "number") {
      doc.setTextColor(100, 116, 139);
      doc.text("Subtotal", xLabel, cursorY);
      doc.setTextColor(31, 41, 55);
      doc.text(money(data.subtotal, company.currency_symbol), xVal, cursorY, { align: "right" });
      cursorY += 5;
    }
    if (data.discount) {
      doc.setTextColor(100, 116, 139);
      doc.text("Discount", xLabel, cursorY);
      doc.setTextColor(31, 41, 55);
      doc.text(`- ${money(data.discount, company.currency_symbol)}`, xVal, cursorY, { align: "right" });
      cursorY += 5;
    }
    if (data.taxAmount) {
      doc.setTextColor(100, 116, 139);
      doc.text("Tax", xLabel, cursorY);
      doc.setTextColor(31, 41, 55);
      doc.text(money(data.taxAmount, company.currency_symbol), xVal, cursorY, { align: "right" });
      cursorY += 5;
    }
    cursorY += 2;
  }

  // Amount box
  doc.setFillColor(245, 243, 238);
  doc.rect(14, cursorY, 182, 30, "F");
  doc.setTextColor(100, 116, 139);
  doc.setFontSize(10);
  doc.text("AMOUNT RECEIVED", 20, cursorY + 10);
  doc.setTextColor(11, 110, 79);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(28);
  doc.text(money(data.amount, company.currency_symbol), 190, cursorY + 22, { align: "right" });
  cursorY += 36;

  if (data.invoiceNumber) {
    doc.setTextColor(100, 116, 139);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Payment for invoice ${data.invoiceNumber}`, 14, cursorY + 4);
  }

  doc.setTextColor(100, 116, 139);
  doc.setFontSize(8);
  doc.text(company.invoice_footer || "Thank you for your payment.", 105, 290, { align: "center" });
  return doc;
}

/** Trigger a native print dialog. On desktop: hidden iframe with the PDF.
 *  On mobile: use Web Share API so the OS print / "Save to Files" sheet
 *  opens (mobile browsers don't reliably print blob URLs). */
export async function printPdf(doc: jsPDF, filename = "document.pdf") {
  const blob = doc.output("blob");

  // Mobile — share sheet lets the user pick "Print" or a printer app
  if (isMobile()) {
    try {
      const file = new File([blob], filename, { type: "application/pdf" });
      const nav = navigator as Navigator & {
        canShare?: (d: { files: File[] }) => boolean;
        share?: (d: { files: File[]; title?: string }) => Promise<void>;
      };
      if (nav.canShare?.({ files: [file] }) && nav.share) {
        await nav.share({ files: [file], title: filename });
        return;
      }
    } catch (e) {
      console.warn("share for print failed", e);
    }
    // Fallback: open PDF so mobile browser's built-in viewer offers Print
    const url = URL.createObjectURL(blob);
    const w = window.open(url, "_blank");
    if (!w) window.location.href = url;
    setTimeout(() => URL.revokeObjectURL(url), 120_000);
    return;
  }

  // Desktop — hidden iframe triggers browser print dialog
  try {
    const url = URL.createObjectURL(blob);
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    iframe.src = url;
    document.body.appendChild(iframe);
    const trigger = () => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch (err) {
        console.warn("iframe print failed, opening in new tab", err);
        window.open(url, "_blank");
      }
    };
    iframe.addEventListener("load", () => setTimeout(trigger, 200));
    setTimeout(trigger, 1200);
    setTimeout(() => {
      iframe.remove();
      URL.revokeObjectURL(url);
    }, 120_000);
  } catch (e) {
    console.warn("printPdf failed", e);
  }
}

/**
 * Thermal receipt (80mm roll). Auto-grows height to fit content.
 * Monospace-style layout suitable for POS thermal printers.
 */
export function generateThermalReceiptPdf(
  data: ReceiptPdfData,
  company: CompanySettings,
  logo: LoadedLogo | null = null,
  widthMm: 58 | 80 = 80,
): jsPDF {
  const W = widthMm; // 58 or 80mm roll
  const M = widthMm === 58 ? 3 : 4;
  const innerW = W - M * 2;
  const sym = company.currency_symbol || "USh ";

  // Estimate height then create doc
  const items = data.items ?? [];
  const estLines =
    18 + // header
    items.reduce((n, it) => n + 2 + Math.ceil(it.description.length / (widthMm === 58 ? 22 : 32)), 0) +
    (data.discount ? 1 : 0) +
    (data.taxAmount ? 1 : 0) +
    (data.invoiceNumber ? 1 : 0) +
    8; // totals + footer
  const H = Math.max(120, estLines * 4 + 30);

  const doc = new jsPDF({ unit: "mm", format: [W, H] });
  doc.setFont("courier", "normal");
  let y = 6;

  // Separator helpers — each visually distinct so sections read clearly
  const dashed = () => {
    y += 1;
    doc.setLineDashPattern([0.6, 0.6], 0);
    doc.setLineWidth(0.2);
    doc.line(M, y, W - M, y);
    doc.setLineDashPattern([], 0);
    y += 3;
  };
  const solid = () => {
    y += 1;
    doc.setLineWidth(0.3);
    doc.line(M, y, W - M, y);
    y += 3;
  };
  const doubleLine = () => {
    y += 1;
    doc.setLineWidth(0.3);
    doc.line(M, y, W - M, y);
    doc.line(M, y + 0.8, W - M, y + 0.8);
    y += 3.5;
  };

  // Logo
  if (logo) {
    const lw = widthMm === 58 ? 14 : 20, lh = widthMm === 58 ? 14 : 20;
    drawLogo(doc, logo, (W - lw) / 2, y, lw, lh);
    y += lh + 2;
  }

  // Company name
  doc.setFont("courier", "bold");
  doc.setFontSize(11);
  doc.text(company.company_name, W / 2, y, { align: "center" });
  y += 4;

  doc.setFont("courier", "normal");
  doc.setFontSize(8);
  const meta = [
    [company.city, company.country].filter(Boolean).join(", "),
    company.address || "",
    company.phone || "",
    company.tax_id ? `TIN: ${company.tax_id}` : "",
  ].filter(Boolean);
  meta.forEach((l) => {
    doc.text(l, W / 2, y, { align: "center" });
    y += 3.5;
  });

  solid(); // company block → meta

  // Receipt meta
  doc.setFontSize(8);
  const kv = (k: string, v: string) => {
    doc.text(k, M, y);
    doc.text(v, W - M, y, { align: "right" });
    y += 3.5;
  };
  kv("Receipt", `#${data.number}`);
  kv("Date", data.date);
  if (data.invoiceNumber) kv("Invoice", data.invoiceNumber);
  kv("Method", data.method.replace(/_/g, " "));
  if (data.cashier) kv("Cashier", data.cashier);
  const custName = data.customer.company || data.customer.name;
  if (custName) kv("Customer", custName.slice(0, 22));

  dashed(); // meta → items

  // Items — description on its own full-width line, then a qty x price / amount row
  if (items.length) {
    doc.setFont("courier", "bold");
    doc.setFontSize(8);
    doc.text("ITEM", M, y);
    doc.text("AMOUNT", W - M, y, { align: "right" });
    y += 1;
    doc.setLineWidth(0.2);
    doc.line(M, y, W - M, y);
    y += 3.5;
    doc.setFont("courier", "normal");
    items.forEach((it, idx) => {
      const desc = doc.splitTextToSize(it.description, innerW);
      desc.forEach((line: string) => {
        doc.text(line, M, y);
        y += 3.4;
      });
      const qtyLabel = `  ${it.quantity} x ${money(it.unit_price, sym)}`;
      doc.text(qtyLabel, M, y);
      doc.text(money(it.line_total, sym), W - M, y, { align: "right" });
      y += 3.6;
      // Thin dotted separator between items (skip after last)
      if (idx < items.length - 1) {
        doc.setLineDashPattern([0.3, 0.6], 0);
        doc.setLineWidth(0.1);
        doc.line(M + 2, y - 1.2, W - M - 2, y - 1.2);
        doc.setLineDashPattern([], 0);
        y += 1;
      }
    });
    dashed(); // items → totals
  }


  // Totals
  const line = (k: string, v: string, bold = false) => {
    doc.setFont("courier", bold ? "bold" : "normal");
    doc.setFontSize(bold ? 10 : 8);
    doc.text(k, M, y);
    doc.text(v, W - M, y, { align: "right" });
    y += bold ? 5 : 3.8;
  };
  if (typeof data.subtotal === "number") line("Subtotal", money(data.subtotal, sym));
  if (data.discount) line("Discount", `- ${money(data.discount, sym)}`);
  if (data.taxAmount) line("Tax", money(data.taxAmount, sym));
  doubleLine(); // emphasized separator before grand total
  line("TOTAL PAID", money(data.amount, sym), true);

  solid(); // totals → footer

  doc.setFont("courier", "normal");
  doc.setFontSize(8);
  const footer = company.invoice_footer || "Thank you for your payment!";
  const fLines = doc.splitTextToSize(footer, innerW);
  fLines.forEach((l: string) => {
    doc.text(l, W / 2, y, { align: "center" });
    y += 3.5;
  });
  y += 2;
  doc.setFontSize(7);
  doc.text("* * *", W / 2, y, { align: "center" });

  return doc;
}


import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader, ListToolbar, EmptyState } from "@/components/page-helpers";
import { formatMoney, formatDate, useCompanySettings } from "@/lib/company";
import { generateReceiptPdf, generateThermalReceiptPdf, loadLogoDataUrl, savePdf } from "@/lib/pdf";
import { toast } from "sonner";
import { Download, Receipt as ReceiptIcon } from "lucide-react";


export const Route = createFileRoute("/_authenticated/receipts")({
  head: () => ({ meta: [{ title: "Receipts" }] }),
  component: ReceiptsPage,
});

function ReceiptsPage() {
  const { data: company } = useCompanySettings();
  const sym = company?.currency_symbol || "$";
  const [q, setQ] = useState("");

  const { data: receipts = [] } = useQuery({
    queryKey: ["receipts"],
    queryFn: async () => {
      const { data } = await supabase
        .from("receipts")
        .select("*, customers(name, company_name, email), invoices(invoice_number)")
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const filtered = receipts.filter((r) => {
    const c = r.customers as { name?: string; company_name?: string } | null;
    return !q || r.receipt_number.toLowerCase().includes(q.toLowerCase())
      || c?.name?.toLowerCase().includes(q.toLowerCase()) || c?.company_name?.toLowerCase().includes(q.toLowerCase());
  });

  const download = async (r: typeof receipts[0]) => {
    if (!company) {
      toast.error("Company settings not loaded", { description: "Refresh the page and try again." });
      return;
    }
    let stage: "render" | "storage" | "response" = "render";
    try {
      const c = r.customers as { name: string; company_name: string | null; email: string | null };
      const inv = r.invoices as { invoice_number?: string } | null;
      const logo = await loadLogoDataUrl(company.logo_url);
      const pdf = generateReceiptPdf({
        number: r.receipt_number, date: formatDate(r.payment_date),
        invoiceNumber: inv?.invoice_number ?? null, customer: c, amount: Number(r.amount), method: r.method,
      }, company, logo);
      stage = "storage";
      stage = "response";
      savePdf(pdf, `${r.receipt_number}.pdf`);
      toast.success("Receipt downloaded");
    } catch (e) {
      console.error(`Receipt PDF ${stage} failed`, e);
      const label = stage === "render" ? "render the receipt" : stage === "storage" ? "prepare the file" : "deliver the download";
      toast.error(`Failed to ${label} (${stage})`, { description: (e as Error).message });
    }
  };

  const downloadThermal = async (r: typeof receipts[0], widthMm: 58 | 80) => {
    if (!company) {
      toast.error("Company settings not loaded", { description: "Refresh the page and try again." });
      return;
    }
    try {
      const c = r.customers as { name: string; company_name: string | null; email: string | null };
      const inv = r.invoices as { invoice_number?: string } | null;
      const logo = await loadLogoDataUrl(company.logo_url);
      const pdf = generateThermalReceiptPdf({
        number: r.receipt_number,
        date: formatDate(r.payment_date),
        invoiceNumber: inv?.invoice_number ?? null,
        customer: c,
        amount: Number(r.amount),
        method: r.method,
      }, company, logo, widthMm);
      savePdf(pdf, `${r.receipt_number}-${widthMm}mm.pdf`);
      toast.success(`${widthMm}mm receipt downloaded`);
    } catch (e) {
      console.error("Thermal receipt failed", e);
      toast.error("Failed to generate thermal receipt", { description: (e as Error).message });
    }
  };


  return (
    <div>
      <PageHeader title="Receipts" subtitle="Auto-generated when invoices are fully paid." />
      <Card className="p-4 shadow-soft border-0">
        <ListToolbar query={q} onQuery={setQ} placeholder="Search receipts…" />
        {filtered.length === 0 ? (
          <EmptyState title="No receipts yet" message="Receipts appear automatically when you fully pay an invoice." />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Receipt #</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => {
                  const c = r.customers as { name?: string; company_name?: string } | null;
                  const inv = r.invoices as { invoice_number?: string } | null;
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.receipt_number}</TableCell>
                      <TableCell>{c?.company_name || c?.name || "—"}</TableCell>
                      <TableCell className="text-xs">{inv?.invoice_number || "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{formatDate(r.payment_date)}</TableCell>
                      <TableCell><Badge variant="secondary" className="capitalize">{r.method.replace("_"," ")}</Badge></TableCell>
                      <TableCell className="text-right tabular-nums font-medium">{formatMoney(r.amount, sym)}</TableCell>
                      <TableCell className="text-right">
                        <Button size="icon" variant="ghost" title="A4 PDF" onClick={() => download(r)}><Download className="h-4 w-4" /></Button>
                        <Button size="icon" variant="ghost" title="Thermal 80mm" onClick={() => downloadThermal(r, 80)}><ReceiptIcon className="h-4 w-4" /></Button>
                        <Button size="sm" variant="ghost" title="Thermal 58mm" onClick={() => downloadThermal(r, 58)} className="px-2 text-xs font-semibold">58</Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
}

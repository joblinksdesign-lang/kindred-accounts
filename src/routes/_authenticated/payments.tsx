import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader, ListToolbar, EmptyState } from "@/components/page-helpers";
import { formatMoney, formatDate, useCompanySettings } from "@/lib/company";

export const Route = createFileRoute("/_authenticated/payments")({
  head: () => ({ meta: [{ title: "Payments" }] }),
  component: PaymentsPage,
});

function PaymentsPage() {
  const { data: company } = useCompanySettings();
  const sym = company?.currency_symbol || "$";
  const [q, setQ] = useState("");

  const { data: payments = [] } = useQuery({
    queryKey: ["payments"],
    queryFn: async () => {
      const { data } = await supabase
        .from("payments")
        .select("*, invoices(invoice_number, customer_id, customers(name, company_name))")
        .order("payment_date", { ascending: false });
      return data ?? [];
    },
  });

  const filtered = payments.filter((p) => {
    const inv = p.invoices as { invoice_number?: string; customers?: { name?: string; company_name?: string } } | null;
    return !q || inv?.invoice_number?.toLowerCase().includes(q.toLowerCase())
      || inv?.customers?.name?.toLowerCase().includes(q.toLowerCase())
      || inv?.customers?.company_name?.toLowerCase().includes(q.toLowerCase());
  });

  return (
    <div>
      <PageHeader title="Payments" subtitle="All payments received across invoices." />
      <Card className="p-4 shadow-soft border-0">
        <ListToolbar query={q} onQuery={setQ} placeholder="Search payments…" />
        {filtered.length === 0 ? (
          <EmptyState title="No payments yet" message="Record a payment from an invoice page to see it here." />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((p) => {
                  const inv = p.invoices as { invoice_number?: string; customers?: { name?: string; company_name?: string } } | null;
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="text-xs text-muted-foreground">{formatDate(p.payment_date)}</TableCell>
                      <TableCell>
                        {inv?.invoice_number ? <Link to="/invoices" className="font-medium text-primary hover:underline">{inv.invoice_number}</Link> : "—"}
                      </TableCell>
                      <TableCell>{inv?.customers?.company_name || inv?.customers?.name || "—"}</TableCell>
                      <TableCell><Badge variant="secondary" className="capitalize">{p.method.replace("_"," ")}</Badge></TableCell>
                      <TableCell className="text-xs text-muted-foreground">{p.reference || "—"}</TableCell>
                      <TableCell className="text-right tabular-nums font-medium">{formatMoney(p.amount, sym)}</TableCell>
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

import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader, ListToolbar, EmptyState } from "@/components/page-helpers";
import { formatMoney, formatDate, useCompanySettings } from "@/lib/company";
import { Plus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/invoices/")({
  head: () => ({ meta: [{ title: "Invoices" }] }),
  component: InvoicesPage,
});

const statusColor: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  sent: "bg-blue-500/15 text-blue-700",
  pending: "bg-[var(--gold)]/20 text-[var(--gold-foreground)]",
  partial: "bg-[var(--gold)]/20 text-[var(--gold-foreground)]",
  paid: "bg-primary/15 text-primary",
  overdue: "bg-destructive/15 text-destructive",
  cancelled: "bg-muted text-muted-foreground",
};

function InvoicesPage() {
  const { data: company } = useCompanySettings();
  const sym = company?.currency_symbol || "$";
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("all");

  const { data: invoices = [] } = useQuery({
    queryKey: ["invoices"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("*, customers(name, company_name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const filtered = invoices.filter((i) => {
    const ok = status === "all" || i.status === status;
    const matches = !q || i.invoice_number.toLowerCase().includes(q.toLowerCase()) ||
      (i.customers as { name?: string; company_name?: string } | null)?.name?.toLowerCase().includes(q.toLowerCase()) ||
      (i.customers as { name?: string; company_name?: string } | null)?.company_name?.toLowerCase().includes(q.toLowerCase());
    return ok && matches;
  });

  return (
    <div>
      <PageHeader
        title="Invoices"
        subtitle="Create, track and collect on invoices."
        action={<Button asChild className="gradient-emerald text-white shadow-soft"><Link to="/invoices/new"><Plus className="h-4 w-4 mr-1.5" />New invoice</Link></Button>}
      />
      <Card className="p-4 shadow-soft border-0">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <ListToolbar query={q} onQuery={setQ} placeholder="Search invoice # or customer…" />
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-40 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {["draft","sent","pending","partial","paid","overdue","cancelled"].map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {filtered.length === 0 ? (
          <EmptyState
            title="No invoices"
            message="Create your first invoice."
            action={<Button asChild className="gradient-emerald text-white"><Link to="/invoices/new"><Plus className="h-4 w-4 mr-1.5" />New invoice</Link></Button>}
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((inv) => {
                  const cust = inv.customers as { name?: string; company_name?: string } | null;
                  return (
                  <TableRow key={inv.id} className="cursor-pointer" onClick={() => window.location.assign(`/invoices/${inv.id}`)}>
                    <TableCell className="font-medium">{inv.invoice_number}</TableCell>
                    <TableCell>
                      <div className="text-sm">{cust?.company_name || cust?.name}</div>
                      {cust?.company_name && <div className="text-xs text-muted-foreground">{cust?.name}</div>}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatDate(inv.invoice_date)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatDate(inv.due_date)}</TableCell>
                    <TableCell><Badge className={`capitalize ${statusColor[inv.status] || ""}`} variant="secondary">{inv.status}</Badge></TableCell>
                    <TableCell className="text-right tabular-nums font-medium">{formatMoney(inv.total, sym)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(inv.balance, sym)}</TableCell>
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

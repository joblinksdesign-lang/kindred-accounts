import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/lib/tenant";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader, ListToolbar, EmptyState } from "@/components/page-helpers";
import { formatMoney, formatDate, useCompanySettings } from "@/lib/company";
import { downloadCsv, downloadReportPdf, toCsv, type ReportColumn } from "@/lib/report-pdf";
import { toast } from "sonner";
import { Download, FileSpreadsheet, Repeat, Trash2, Pencil } from "lucide-react";

export const Route = createFileRoute("/_authenticated/expenses")({
  head: () => ({
    meta: [
      { title: "Expenses — track and automate business spending" },
      { name: "description", content: "Record business expenses, categorise spending and set daily, weekly or monthly recurring expenses." },
      { property: "og:title", content: "Expenses — track and automate business spending" },
      { property: "og:description", content: "Record business expenses and schedule recurring costs automatically." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ExpensesPage,
});

type Recurrence = "none" | "daily" | "weekly" | "monthly";

type Expense = {
  id: string;
  tenant_id: string;
  expense_date: string;
  category: string | null;
  vendor: string | null;
  description: string;
  amount: number;
  method: string;
  reference: string | null;
  notes: string | null;
  recurrence: Recurrence;
  recurrence_end: string | null;
  next_run_date: string | null;
  parent_expense_id: string | null;
};

const METHODS = ["cash", "bank_transfer", "mobile_money", "credit_card", "cheque"] as const;
const today = () => new Date().toISOString().slice(0, 10);

function advance(dateStr: string, recurrence: Recurrence) {
  const d = new Date(dateStr + "T00:00:00");
  if (recurrence === "daily") d.setDate(d.getDate() + 1);
  else if (recurrence === "weekly") d.setDate(d.getDate() + 7);
  else if (recurrence === "monthly") d.setMonth(d.getMonth() + 1);
  return d.toISOString().slice(0, 10);
}

const emptyForm = () => ({
  id: "",
  expense_date: today(),
  category: "",
  vendor: "",
  description: "",
  amount: "",
  method: "cash",
  reference: "",
  notes: "",
  recurrence: "none" as Recurrence,
  recurrence_end: "",
});

function ExpensesPage() {
  const qc = useQueryClient();
  const { tenantId, role } = useActiveTenant();
  const { data: company } = useCompanySettings();
  const sym = company?.currency_symbol || "USh ";
  const canWrite = role === "owner" || role === "manager" || role === "accountant";
  const canDelete = role === "owner" || role === "manager";

  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const set = (k: string, v: unknown) => setForm((p) => ({ ...p, [k]: v }));

  const { data: expenses = [], isLoading } = useQuery({
    queryKey: ["expenses", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expenses")
        .select("*")
        .eq("tenant_id", tenantId!)
        .order("expense_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Expense[];
    },
  });

  // Materialise any recurring expenses that are due.
  const runDue = useMutation({
    mutationFn: async () => {
      const t = today();
      const due = expenses.filter(
        (e) => e.recurrence !== "none" && e.next_run_date && e.next_run_date <= t,
      );
      let created = 0;
      for (const tpl of due) {
        let next = tpl.next_run_date!;
        const guard = 400;
        let i = 0;
        while (next <= t && (!tpl.recurrence_end || next <= tpl.recurrence_end) && i++ < guard) {
          const { error } = await supabase.from("expenses").insert({
            tenant_id: tpl.tenant_id,
            expense_date: next,
            category: tpl.category,
            vendor: tpl.vendor,
            description: tpl.description,
            amount: tpl.amount,
            method: tpl.method,
            reference: tpl.reference,
            notes: tpl.notes,
            recurrence: "none",
            parent_expense_id: tpl.id,
          } as never);
          if (error) throw error;
          created++;
          next = advance(next, tpl.recurrence);
        }
        const stop = tpl.recurrence_end && next > tpl.recurrence_end;
        await supabase
          .from("expenses")
          .update({ next_run_date: stop ? null : next, recurrence: stop ? "none" : tpl.recurrence } as never)
          .eq("id", tpl.id);
      }
      return created;
    },
    onSuccess: (created) => {
      if (created > 0) {
        toast.success(`${created} recurring expense${created > 1 ? "s" : ""} posted`);
        qc.invalidateQueries({ queryKey: ["expenses"] });
      }
    },
  });

  useEffect(() => {
    if (!canWrite || isLoading || expenses.length === 0 || runDue.isPending) return;
    const t = today();
    const hasDue = expenses.some((e) => e.recurrence !== "none" && e.next_run_date && e.next_run_date <= t);
    if (hasDue) runDue.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expenses, isLoading, canWrite]);

  const save = useMutation({
    mutationFn: async () => {
      if (!tenantId) throw new Error("No active business");
      if (!form.description.trim()) throw new Error("Add a description");
      const amount = Number(form.amount);
      if (!amount || amount <= 0) throw new Error("Enter a valid amount");
      const payload = {
        tenant_id: tenantId,
        expense_date: form.expense_date,
        category: form.category || null,
        vendor: form.vendor || null,
        description: form.description.trim(),
        amount,
        method: form.method,
        reference: form.reference || null,
        notes: form.notes || null,
        recurrence: form.recurrence,
        recurrence_end: form.recurrence === "none" ? null : form.recurrence_end || null,
        next_run_date: form.recurrence === "none" ? null : advance(form.expense_date, form.recurrence),
      };
      if (form.id) {
        const { error } = await supabase.from("expenses").update(payload as never).eq("id", form.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("expenses").insert(payload as never);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(form.id ? "Expense updated" : "Expense recorded");
      setOpen(false);
      setForm(emptyForm());
      qc.invalidateQueries({ queryKey: ["expenses"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("expenses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Expense deleted"); qc.invalidateQueries({ queryKey: ["expenses"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const categories = useMemo(
    () => Array.from(new Set(expenses.map((e) => e.category).filter(Boolean) as string[])).sort(),
    [expenses],
  );

  const filtered = expenses.filter((e) => {
    const s = q.toLowerCase();
    return !q || e.description.toLowerCase().includes(s) || (e.category || "").toLowerCase().includes(s)
      || (e.vendor || "").toLowerCase().includes(s) || (e.reference || "").toLowerCase().includes(s);
  });

  const total = filtered.reduce((s, e) => s + Number(e.amount), 0);
  const monthTotal = expenses
    .filter((e) => e.expense_date.startsWith(today().slice(0, 7)))
    .reduce((s, e) => s + Number(e.amount), 0);
  const recurringCount = expenses.filter((e) => e.recurrence !== "none").length;

  const reportColumns: ReportColumn[] = [
    { header: "Date", align: "left", width: 24 },
    { header: "Description", align: "left" },
    { header: "Category", align: "left", width: 28 },
    { header: "Vendor", align: "left", width: 30 },
    { header: "Method", align: "left", width: 26 },
    { header: "Amount", align: "right", width: 30 },
  ];
  const reportRows = filtered.map((e) => [
    formatDate(e.expense_date),
    e.description,
    e.category || "—",
    e.vendor || "—",
    e.method.replace("_", " "),
    formatMoney(e.amount, sym),
  ]);

  const exportPdf = async () => {
    if (!company) return;
    try {
      await downloadReportPdf(
        {
          title: "Expenses report",
          subtitle: `${filtered.length} expense${filtered.length === 1 ? "" : "s"}${q ? ` matching “${q}”` : ""}`,
          columns: reportColumns,
          rows: reportRows,
          totalsRow: ["", "", "", "", "Total", formatMoney(total, sym)],
        },
        company,
        "expenses-report.pdf",
      );
    } catch (err) {
      toast.error("Could not create PDF", { description: (err as Error).message });
    }
  };

  const openEdit = (e: Expense) => {
    setForm({
      id: e.id,
      expense_date: e.expense_date,
      category: e.category || "",
      vendor: e.vendor || "",
      description: e.description,
      amount: String(e.amount),
      method: e.method,
      reference: e.reference || "",
      notes: e.notes || "",
      recurrence: e.recurrence,
      recurrence_end: e.recurrence_end || "",
    });
    setOpen(true);
  };

  return (
    <div>
      <PageHeader
        title="Expenses"
        subtitle="Record business spending and automate recurring costs."
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => downloadCsv("expenses.csv", toCsv(reportColumns, reportRows))} disabled={!filtered.length}>
              <FileSpreadsheet className="h-4 w-4 mr-1.5" />CSV
            </Button>
            <Button variant="outline" size="sm" onClick={exportPdf} disabled={!filtered.length || !company}>
              <Download className="h-4 w-4 mr-1.5" />PDF
            </Button>
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3 mb-4">
        {[
          { label: "Total (filtered)", value: formatMoney(total, sym) },
          { label: "This month", value: formatMoney(monthTotal, sym) },
          { label: "Recurring schedules", value: String(recurringCount) },
        ].map((k) => (
          <Card key={k.label} className="p-4 shadow-soft border-0">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{k.label}</div>
            <div className="mt-1.5 text-lg sm:text-xl xl:text-2xl font-bold tabular-nums break-words [overflow-wrap:anywhere]">{k.value}</div>
          </Card>
        ))}
      </div>

      <Card className="p-4 shadow-soft border-0">
        <ListToolbar
          query={q}
          onQuery={setQ}
          placeholder="Search expenses…"
          onAdd={canWrite ? () => { setForm(emptyForm()); setOpen(true); } : undefined}
          addLabel="Add expense"
        />
        {filtered.length === 0 ? (
          <EmptyState title="No expenses yet" message="Record rent, salaries, transport, utilities and other business costs here." />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{formatDate(e.expense_date)}</TableCell>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <span>{e.description}</span>
                        {e.recurrence !== "none" && (
                          <Badge variant="secondary" className="gap-1 capitalize"><Repeat className="h-3 w-3" />{e.recurrence}</Badge>
                        )}
                        {e.parent_expense_id && <Badge variant="outline" className="text-[10px]">auto</Badge>}
                      </div>
                      {e.recurrence !== "none" && e.next_run_date && (
                        <div className="text-[11px] text-muted-foreground">Next: {formatDate(e.next_run_date)}</div>
                      )}
                    </TableCell>
                    <TableCell>{e.category || "—"}</TableCell>
                    <TableCell>{e.vendor || "—"}</TableCell>
                    <TableCell className="capitalize">{e.method.replace("_", " ")}</TableCell>
                    <TableCell className="text-right tabular-nums font-semibold whitespace-nowrap">{formatMoney(e.amount, sym)}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        {canWrite && (
                          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(e)} aria-label="Edit expense">
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                        {canDelete && (
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => remove.mutate(e.id)} aria-label="Delete expense">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader><DialogTitle>{form.id ? "Edit expense" : "Add expense"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Date</Label><Input type="date" value={form.expense_date} onChange={(e) => set("expense_date", e.target.value)} /></div>
            <div><Label>Amount</Label><Input type="number" step="0.01" min="0" value={form.amount} onChange={(e) => set("amount", e.target.value)} placeholder="0.00" /></div>
            <div className="col-span-2"><Label>Description</Label><Input value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="Office rent, fuel, salaries…" /></div>
            <div>
              <Label>Category</Label>
              <Input list="expense-categories" value={form.category} onChange={(e) => set("category", e.target.value)} placeholder="Rent, Utilities…" />
              <datalist id="expense-categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
            </div>
            <div><Label>Vendor</Label><Input value={form.vendor} onChange={(e) => set("vendor", e.target.value)} /></div>
            <div>
              <Label>Payment method</Label>
              <Select value={form.method} onValueChange={(v) => set("method", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {METHODS.map((m) => <SelectItem key={m} value={m} className="capitalize">{m.replace("_", " ")}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Reference</Label><Input value={form.reference} onChange={(e) => set("reference", e.target.value)} /></div>
            <div>
              <Label>Repeat</Label>
              <Select value={form.recurrence} onValueChange={(v) => set("recurrence", v as Recurrence)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">One-off</SelectItem>
                  <SelectItem value="daily">Every day</SelectItem>
                  <SelectItem value="weekly">Every week</SelectItem>
                  <SelectItem value="monthly">Every month</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.recurrence !== "none" && (
              <div><Label>Repeat until (optional)</Label><Input type="date" value={form.recurrence_end} onChange={(e) => set("recurrence_end", e.target.value)} /></div>
            )}
            <div className="col-span-2"><Label>Notes</Label><Textarea rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} /></div>
            {form.recurrence !== "none" && (
              <p className="col-span-2 text-xs text-muted-foreground">
                This expense repeats {form.recurrence === "daily" ? "every day" : form.recurrence === "weekly" ? "every week" : "every month"} from{" "}
                {formatDate(form.expense_date)}. Each due entry is posted automatically when you open this page.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending} className="gradient-emerald text-white">
              {save.isPending ? "Saving…" : form.id ? "Save changes" : "Add expense"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

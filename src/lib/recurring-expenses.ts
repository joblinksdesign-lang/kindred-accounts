import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

type Recurrence = "none" | "daily" | "weekly" | "monthly";

type Template = {
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
  branch_id: string | null;
};

const today = () => new Date().toISOString().slice(0, 10);

export function advance(dateStr: string, recurrence: Recurrence) {
  const d = new Date(dateStr + "T00:00:00");
  if (recurrence === "daily") d.setDate(d.getDate() + 1);
  else if (recurrence === "weekly") d.setDate(d.getDate() + 7);
  else if (recurrence === "monthly") d.setMonth(d.getMonth() + 1);
  else return dateStr;
  return d.toISOString().slice(0, 10);
}

/**
 * Posts every recurring expense that is due for this business, regardless of
 * which branch is currently selected. Safe to call repeatedly — a date that is
 * already posted for a schedule is never posted twice.
 */
export async function postDueRecurringExpenses(tenantId: string): Promise<number> {
  const t = today();
  const { data, error } = await supabase
    .from("expenses")
    .select("*")
    .eq("tenant_id", tenantId)
    .neq("recurrence", "none")
    .not("next_run_date", "is", null)
    .lte("next_run_date", t);
  if (error) throw error;
  const due = (data ?? []) as unknown as Template[];
  let created = 0;

  for (const tpl of due) {
    const { data: existing, error: existErr } = await supabase
      .from("expenses")
      .select("expense_date")
      .eq("parent_expense_id", tpl.id);
    if (existErr) throw existErr;
    const posted = new Set([tpl.expense_date, ...(existing ?? []).map((r) => r.expense_date as string)]);

    let next = tpl.next_run_date!;
    const guard = 400;
    let i = 0;
    while (next <= t && (!tpl.recurrence_end || next <= tpl.recurrence_end) && i++ < guard) {
      if (!posted.has(next)) {
        const { error: insErr } = await supabase.from("expenses").insert({
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
          branch_id: tpl.branch_id ?? null,
        } as never);
        if (insErr) throw insErr;
        posted.add(next);
        created++;
      }
      const moved = advance(next, tpl.recurrence);
      if (moved === next) break;
      next = moved;
    }

    const stop = !!tpl.recurrence_end && next > tpl.recurrence_end;
    const { error: updErr } = await supabase
      .from("expenses")
      .update({ next_run_date: stop ? null : next, recurrence: stop ? "none" : tpl.recurrence } as never)
      .eq("id", tpl.id);
    if (updErr) throw updErr;
  }
  return created;
}

const ranFor = new Set<string>();

/** Runs due recurring expenses once per session per business, then refreshes data. */
export function useRecurringExpenses(tenantId?: string | null, enabled = true) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!tenantId || !enabled || ranFor.has(tenantId)) return;
    ranFor.add(tenantId);
    postDueRecurringExpenses(tenantId)
      .then((created) => {
        if (created > 0) {
          qc.invalidateQueries({ queryKey: ["expenses"] });
          qc.invalidateQueries({ queryKey: ["dashboard_stats"] });
          qc.invalidateQueries({ queryKey: ["reports"] });
        }
      })
      .catch(() => {
        ranFor.delete(tenantId);
      });
  }, [tenantId, enabled, qc]);
}

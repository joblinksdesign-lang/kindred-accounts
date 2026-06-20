import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageHeader } from "@/components/page-helpers";
import { toast } from "sonner";
import { Plus, Pencil, Archive } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/plans")({
  head: () => ({ meta: [{ title: "Plans — Super Admin" }] }),
  component: AdminPlans,
});

type Plan = {
  id: string; slug: string; name: string; tagline: string | null; description: string | null;
  price_monthly: number; price_annual: number; trial_days: number;
  max_invoices_per_month: number | null; max_customers: number | null;
  max_users: number | null; max_products: number | null;
  features: string[]; is_active: boolean; is_public: boolean; is_default: boolean; sort_order: number;
};

function AdminPlans() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Plan | null>(null);

  const { data: plans = [] } = useQuery({
    queryKey: ["admin_plans"],
    queryFn: async () => {
      const { data, error } = await supabase.from("plans").select("*").order("sort_order");
      if (error) throw error;
      return (data ?? []).map((p) => ({ ...p, features: (p.features as string[]) ?? [] })) as Plan[];
    },
  });

  const upsert = useMutation({
    mutationFn: async (form: Partial<Plan>) => {
      if (editing) {
        const { error } = await supabase.from("plans").update(form as never).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("plans").insert(form as never);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Plan updated" : "Plan created");
      qc.invalidateQueries({ queryKey: ["admin_plans"] });
      setOpen(false); setEditing(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const archive = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("plans").update({ is_active: false, is_public: false }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Plan archived"); qc.invalidateQueries({ queryKey: ["admin_plans"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const features = String(fd.get("features") || "").split("\n").map((s) => s.trim()).filter(Boolean);
    const num = (k: string) => {
      const v = fd.get(k); return v === "" || v == null ? null : Number(v);
    };
    upsert.mutate({
      slug: String(fd.get("slug")),
      name: String(fd.get("name")),
      tagline: String(fd.get("tagline") || "") || null,
      description: String(fd.get("description") || "") || null,
      price_monthly: Number(fd.get("price_monthly") || 0),
      price_annual: Number(fd.get("price_annual") || 0),
      trial_days: Number(fd.get("trial_days") || 0),
      max_invoices_per_month: num("max_invoices_per_month"),
      max_customers: num("max_customers"),
      max_users: num("max_users"),
      max_products: num("max_products"),
      features,
      sort_order: Number(fd.get("sort_order") || 0),
      is_active: fd.get("is_active") === "on",
      is_public: fd.get("is_public") === "on",
      is_default: fd.get("is_default") === "on",
    });
  };

  return (
    <div>
      <PageHeader
        title="Subscription plans"
        subtitle="Define what each plan includes and how much it costs."
        action={<Button onClick={() => { setEditing(null); setOpen(true); }} className="gradient-emerald text-white"><Plus className="h-4 w-4 mr-1.5" />New plan</Button>}
      />
      <Card className="p-4 shadow-soft border-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Plan</TableHead>
                <TableHead>Pricing</TableHead>
                <TableHead>Limits</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {plans.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <div className="font-semibold flex items-center gap-1.5">
                      {p.name} {p.is_default && <Badge variant="secondary" className="text-[10px]">Default</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground">{p.tagline}</div>
                  </TableCell>
                  <TableCell className="text-xs">
                    <div>${p.price_monthly}/mo</div>
                    <div className="text-muted-foreground">${p.price_annual}/yr</div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    Inv: {p.max_invoices_per_month ?? "∞"} • Cust: {p.max_customers ?? "∞"} • Users: {p.max_users ?? "∞"}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <Badge variant={p.is_active ? "default" : "secondary"} className="w-fit text-[10px]">{p.is_active ? "Active" : "Inactive"}</Badge>
                      {p.is_public && <Badge variant="outline" className="w-fit text-[10px]">Public</Badge>}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="icon" variant="ghost" onClick={() => { setEditing(p); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => confirm("Archive plan?") && archive.mutate(p.id)}><Archive className="h-4 w-4 text-destructive" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{editing ? "Edit plan" : "New plan"}</DialogTitle></DialogHeader>
          <form onSubmit={onSubmit} className="grid grid-cols-2 gap-3">
            <div><Label>Name *</Label><Input name="name" defaultValue={editing?.name} required /></div>
            <div><Label>Slug *</Label><Input name="slug" defaultValue={editing?.slug} required /></div>
            <div className="col-span-2"><Label>Tagline</Label><Input name="tagline" defaultValue={editing?.tagline ?? ""} /></div>
            <div className="col-span-2"><Label>Description</Label><Textarea name="description" rows={2} defaultValue={editing?.description ?? ""} /></div>
            <div><Label>Monthly price ($)</Label><Input name="price_monthly" type="number" step="0.01" defaultValue={editing?.price_monthly ?? 0} /></div>
            <div><Label>Annual price ($)</Label><Input name="price_annual" type="number" step="0.01" defaultValue={editing?.price_annual ?? 0} /></div>
            <div><Label>Trial days</Label><Input name="trial_days" type="number" defaultValue={editing?.trial_days ?? 0} /></div>
            <div><Label>Sort order</Label><Input name="sort_order" type="number" defaultValue={editing?.sort_order ?? 0} /></div>
            <div><Label>Max invoices / mo (blank = ∞)</Label><Input name="max_invoices_per_month" type="number" defaultValue={editing?.max_invoices_per_month ?? ""} /></div>
            <div><Label>Max customers</Label><Input name="max_customers" type="number" defaultValue={editing?.max_customers ?? ""} /></div>
            <div><Label>Max users</Label><Input name="max_users" type="number" defaultValue={editing?.max_users ?? ""} /></div>
            <div><Label>Max products</Label><Input name="max_products" type="number" defaultValue={editing?.max_products ?? ""} /></div>
            <div className="col-span-2"><Label>Features (one per line)</Label><Textarea name="features" rows={4} defaultValue={editing?.features.join("\n") ?? ""} /></div>
            <div className="col-span-2 flex flex-wrap gap-6 pt-2">
              <label className="flex items-center gap-2 text-sm"><Switch name="is_active" defaultChecked={editing?.is_active ?? true} /> Active</label>
              <label className="flex items-center gap-2 text-sm"><Switch name="is_public" defaultChecked={editing?.is_public ?? true} /> Public</label>
              <label className="flex items-center gap-2 text-sm"><Switch name="is_default" defaultChecked={editing?.is_default ?? false} /> Default plan</label>
            </div>
            <DialogFooter className="col-span-2 mt-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={upsert.isPending} className="gradient-emerald text-white">{editing ? "Save" : "Create"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

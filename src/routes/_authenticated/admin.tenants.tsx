import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/page-helpers";
import { toast } from "sonner";
import { formatDate } from "@/lib/company";
import { Check, X, Pause, Play } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/tenants")({
  head: () => ({ meta: [{ title: "Businesses — Super Admin" }] }),
  component: AdminTenants,
});

type TenantRow = {
  id: string; business_name: string; email: string; phone: string | null;
  country: string | null; currency: string; status: "pending" | "active" | "suspended" | "expired" | "cancelled";
  plan_id: string | null; created_at: string; approved_at: string | null;
  plans?: { name: string } | null;
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-500/10 text-amber-700 border-amber-500/30",
  active: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30",
  suspended: "bg-red-500/10 text-red-700 border-red-500/30",
  expired: "bg-muted text-muted-foreground border-border",
  cancelled: "bg-muted text-muted-foreground border-border",
};

function AdminTenants() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<string>("all");

  const { data: tenants = [] } = useQuery({
    queryKey: ["admin_tenants"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenants")
        .select("id, business_name, email, phone, country, currency, status, plan_id, created_at, approved_at, plans(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as TenantRow[];
    },
  });

  const { data: plans = [] } = useQuery({
    queryKey: ["all_plans"],
    queryFn: async () => {
      const { data } = await supabase.from("plans").select("id, name").order("sort_order");
      return data ?? [];
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: TenantRow["status"] }) => {
      const patch: { status: TenantRow["status"]; approved_at?: string; suspended_at?: string } = { status };
      if (status === "active") patch.approved_at = new Date().toISOString();
      if (status === "suspended") patch.suspended_at = new Date().toISOString();
      const { error } = await supabase.from("tenants").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Updated"); qc.invalidateQueries({ queryKey: ["admin_tenants"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const updatePlan = useMutation({
    mutationFn: async ({ id, plan_id }: { id: string; plan_id: string }) => {
      const { error } = await supabase.from("tenants").update({ plan_id }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Plan updated"); qc.invalidateQueries({ queryKey: ["admin_tenants"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = tenants.filter((t) => {
    if (filter !== "all" && t.status !== filter) return false;
    const term = q.toLowerCase();
    return !term || [t.business_name, t.email, t.country].some((v) => v?.toLowerCase().includes(term));
  });

  return (
    <div>
      <PageHeader title="Businesses" subtitle="Approve, suspend and manage every business on the platform." />
      <Card className="p-4 shadow-soft border-0">
        <div className="flex flex-col md:flex-row gap-3 mb-4">
          <Input placeholder="Search businesses…" value={q} onChange={(e) => setQ(e.target.value)} className="md:max-w-sm" />
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="md:w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="suspended">Suspended</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Business</TableHead>
                <TableHead>Country</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((t) => (
                <TableRow key={t.id}>
                  <TableCell>
                    <div className="font-medium">{t.business_name}</div>
                    <div className="text-xs text-muted-foreground">{t.email}</div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{t.country || "—"} • {t.currency}</TableCell>
                  <TableCell>
                    <Select value={t.plan_id ?? ""} onValueChange={(v) => updatePlan.mutate({ id: t.id, plan_id: v })}>
                      <SelectTrigger className="h-8 w-36 text-xs"><SelectValue placeholder="Pick plan" /></SelectTrigger>
                      <SelectContent>
                        {plans.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`text-xs capitalize ${STATUS_COLORS[t.status]}`}>{t.status}</Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{formatDate(t.created_at)}</TableCell>
                  <TableCell className="text-right">
                    {t.status === "pending" && (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => updateStatus.mutate({ id: t.id, status: "active" })}>
                          <Check className="h-4 w-4 text-emerald-600" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => updateStatus.mutate({ id: t.id, status: "cancelled" })}>
                          <X className="h-4 w-4 text-red-600" />
                        </Button>
                      </>
                    )}
                    {t.status === "active" && (
                      <Button size="sm" variant="ghost" onClick={() => updateStatus.mutate({ id: t.id, status: "suspended" })}>
                        <Pause className="h-4 w-4 text-amber-600" />
                      </Button>
                    )}
                    {t.status === "suspended" && (
                      <Button size="sm" variant="ghost" onClick={() => updateStatus.mutate({ id: t.id, status: "active" })}>
                        <Play className="h-4 w-4 text-emerald-600" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">No businesses match.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}

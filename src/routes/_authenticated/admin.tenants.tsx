import { createFileRoute, useRouterState } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { PageHeader } from "@/components/page-helpers";
import { toast } from "sonner";
import { formatDate } from "@/lib/company";
import { Check, X, Pause, Play, Trash2, Eraser } from "lucide-react";
import { purgeTenantData } from "@/lib/admin.functions";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";


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
  const tenantParam = useRouterState({ select: (s) => s.location.search.tenant as string | undefined });
  const subscriptionParam = useRouterState({ select: (s) => s.location.search.subscription as string | undefined });
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<string>("all");
  const [purgeTarget, setPurgeTarget] = useState<{ id: string; name: string } | null>(null);
  const [purgePassword, setPurgePassword] = useState("");
  const purgeFn = useServerFn(purgeTenantData);


  const { data: tenants = [] } = useQuery({
    queryKey: ["admin_tenants"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenants")
        .select("id, business_name, email, phone, country, currency, status, plan_id, created_at, approved_at, plans:plan_id(name)")
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

  const deleteTenant = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tenants").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Business deleted"); qc.invalidateQueries({ queryKey: ["admin_tenants"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const purgeTenant = useMutation({
    mutationFn: async () => {
      if (!purgeTarget) return;
      await purgeFn({ data: { tenantId: purgeTarget.id, password: purgePassword } });
    },
    onSuccess: () => {
      toast.success("Business data emptied", { description: `${purgeTarget?.name} now starts from a clean slate.` });
      setPurgeTarget(null);
      setPurgePassword("");
      qc.invalidateQueries({ queryKey: ["admin_tenants"] });
    },
    onError: (e: Error) => toast.error("Could not empty database", { description: e.message }),
  });


  const { data: pendingReqs = [] } = useQuery({
    queryKey: ["pending_plan_requests"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscriptions")
        .select("id, tenant_id, plan_id, pending_plan_id, pending_billing_cycle, pending_requested_at, tenants(business_name, email), pending_plan:plans!subscriptions_pending_plan_id_fkey(name), current_plan:plans!subscriptions_plan_id_fkey(name)")
        .not("pending_plan_id", "is", null)
        .order("pending_requested_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Array<{
        id: string; tenant_id: string; plan_id: string; pending_plan_id: string;
        pending_billing_cycle: "monthly" | "annual"; pending_requested_at: string;
        tenants: { business_name: string; email: string } | null;
        pending_plan: { name: string } | null;
        current_plan: { name: string } | null;
      }>;
    },
  });

  const approveRequest = useMutation({
    mutationFn: async (row: { id: string; pending_plan_id: string; pending_billing_cycle: "monthly" | "annual"; tenant_id: string }) => {
      const { error } = await supabase.from("subscriptions").update({
        plan_id: row.pending_plan_id,
        billing_cycle: row.pending_billing_cycle,
        status: "active",
        pending_plan_id: null,
        pending_billing_cycle: null,
        pending_requested_at: null,
      }).eq("id", row.id);
      if (error) throw error;
      await supabase.from("tenants").update({ plan_id: row.pending_plan_id }).eq("id", row.tenant_id);
    },
    onSuccess: () => {
      toast.success("Plan activated");
      qc.invalidateQueries({ queryKey: ["pending_plan_requests"] });
      qc.invalidateQueries({ queryKey: ["admin_tenants"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const denyRequest = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("subscriptions").update({
        pending_plan_id: null, pending_billing_cycle: null, pending_requested_at: null,
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Request denied"); qc.invalidateQueries({ queryKey: ["pending_plan_requests"] }); },
  });

  const filtered = tenants.filter((t) => {
    if (filter !== "all" && t.status !== filter) return false;
    const term = q.toLowerCase();
    return !term || [t.business_name, t.email, t.country].some((v) => v?.toLowerCase().includes(term));
  });

  return (
    <div>
      <PageHeader title="Businesses" subtitle="Approve, suspend and manage every business on the platform." />

      {pendingReqs.length > 0 && (
        <Card className="p-4 mb-4 border-amber-500/40 bg-amber-500/5">
          <div className="text-sm font-semibold mb-2">Pending plan requests ({pendingReqs.length})</div>
          <div className="space-y-2">
            {pendingReqs.map((r) => (
              <div key={r.id} className={`flex flex-wrap items-center justify-between gap-2 text-sm border-b last:border-0 pb-2 last:pb-0 ${subscriptionParam === r.id ? "rounded-md bg-primary/10 px-2 ring-1 ring-primary/30" : ""}`}>
                <div>
                  <b>{r.tenants?.business_name}</b> wants to switch{" "}
                  {r.current_plan?.name ? <>from <b>{r.current_plan.name}</b> </> : null}
                  to <b>{r.pending_plan?.name}</b> ({r.pending_billing_cycle})
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => approveRequest.mutate({ id: r.id, pending_plan_id: r.pending_plan_id, pending_billing_cycle: r.pending_billing_cycle, tenant_id: r.tenant_id })}>Activate</Button>
                  <Button size="sm" variant="outline" onClick={() => denyRequest.mutate(r.id)}>Deny</Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

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
                <TableRow key={t.id} className={tenantParam === t.id ? "bg-primary/10 ring-1 ring-primary/30" : ""}>
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
                    <Button
                      size="sm"
                      variant="ghost"
                      title="Empty database"
                      onClick={() => { setPurgePassword(""); setPurgeTarget({ id: t.id, name: t.business_name }); }}
                    >
                      <Eraser className="h-4 w-4 text-amber-600" />
                    </Button>
                    <AlertDialog>

                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="ghost" title="Delete business">
                          <Trash2 className="h-4 w-4 text-red-600" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete {t.business_name}?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This permanently removes the business and all of its data
                            (invoices, customers, products, payments, etc.). This cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => deleteTenant.mutate(t.id)}
                            className="bg-red-600 hover:bg-red-700 text-white"
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
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

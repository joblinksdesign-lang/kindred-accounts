import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/page-helpers";
import { useCurrentUser } from "@/lib/use-current-user";
import { useActiveTenantId } from "@/lib/tenant";
import { Bell, CheckCheck, Search, Trash2, Filter } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/notifications")({
  head: () => ({ meta: [{ title: "Notifications" }] }),
  component: NotificationsPage,
  errorComponent: ({ error }) => (
    <div className="p-8 text-sm text-destructive">{error.message}</div>
  ),
  notFoundComponent: () => <div className="p-8 text-sm">Not found</div>,
});

type Notification = {
  id: string;
  type: string;
  title: string;
  message: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
  tenant_id: string;
};

const FILTERS = [
  { key: "all", label: "All" },
  { key: "unread", label: "Unread" },
  { key: "low_stock", label: "Low stock" },
  { key: "overdue", label: "Overdue" },
  { key: "subscription", label: "Subscription" },
  { key: "plan_request", label: "Plan requests" },
  { key: "business_registered", label: "New businesses" },
] as const;

type FilterKey = (typeof FILTERS)[number]["key"];

function NotificationsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { user, isSuperAdmin } = useCurrentUser();
  const tenantId = useActiveTenantId();
  const [filter, setFilter] = useState<FilterKey>("all");
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!tenantId || isSuperAdmin) return;
    supabase.rpc("refresh_tenant_alerts", { _tenant: tenantId });
  }, [tenantId, isSuperAdmin]);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["notifications_all", user?.id, tenantId, isSuperAdmin],
    enabled: !!user,
    refetchInterval: 30_000,
    queryFn: async () => {
      let query = supabase
        .from("notifications")
        .select("id, type, title, message, link, read_at, created_at, tenant_id")
        .order("created_at", { ascending: false })
        .limit(200);
      if (!isSuperAdmin && tenantId) query = query.eq("tenant_id", tenantId);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as Notification[];
    },
  });

  // Realtime updates
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("notifications-page")
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, () => {
        qc.invalidateQueries({ queryKey: ["notifications_all"] });
        qc.invalidateQueries({ queryKey: ["notifications"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, qc]);

  const filtered = useMemo(() => {
    return items.filter((n) => {
      if (filter === "unread" && n.read_at) return false;
      if (filter === "low_stock" && !n.type.startsWith("low_stock")) return false;
      if (filter === "overdue" && !n.type.startsWith("overdue")) return false;
      if (filter === "subscription" && !n.type.startsWith("subscription")) return false;
      if (filter === "plan_request" && !n.type.startsWith("plan_")) return false;
      if (filter === "business_registered" && n.type !== "business_registered") return false;
      if (q) {
        const s = q.toLowerCase();
        if (!n.title.toLowerCase().includes(s) && !(n.message ?? "").toLowerCase().includes(s)) return false;
      }
      return true;
    });
  }, [items, filter, q]);

  const unreadCount = items.filter((n) => !n.read_at).length;

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications_all"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const markAll = useMutation({
    mutationFn: async () => {
      const ids = items.filter((n) => !n.read_at).map((n) => n.id);
      if (!ids.length) return;
      const { error } = await supabase.from("notifications").update({ read_at: new Date().toISOString() }).in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("All notifications marked as read");
      qc.invalidateQueries({ queryKey: ["notifications_all"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("notifications").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications_all"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const openItem = (n: Notification) => {
    if (!n.read_at) markRead.mutate(n.id);
    if (n.link) navigate({ to: n.link });
  };

  const badgeColor = (type: string) => {
    if (type.startsWith("low_stock")) return "bg-amber-500/15 text-amber-700 dark:text-amber-300";
    if (type.startsWith("overdue")) return "bg-red-500/15 text-red-700 dark:text-red-300";
    if (type.startsWith("subscription")) return "bg-purple-500/15 text-purple-700 dark:text-purple-300";
    if (type.startsWith("plan_")) return "bg-blue-500/15 text-blue-700 dark:text-blue-300";
    if (type === "business_registered") return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
    return "bg-muted text-muted-foreground";
  };

  return (
    <div className="p-6 space-y-5">
      <PageHeader
        title="Notifications"
        subtitle={`${unreadCount} unread of ${items.length} total`}
        action={
          unreadCount > 0 ? (
            <Button variant="outline" size="sm" onClick={() => markAll.mutate()} disabled={markAll.isPending}>
              <CheckCheck className="h-4 w-4 mr-1.5" /> Mark all read
            </Button>
          ) : null
        }
      />

      <Card className="p-3 flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input placeholder="Search notifications…" className="pl-8 h-9" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <Filter className="h-3.5 w-3.5 text-muted-foreground" />
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-3 py-1 rounded-full text-xs border transition ${
                filter === f.key ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-accent"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </Card>

      <Card className="divide-y">
        {isLoading && <div className="p-6 text-sm text-muted-foreground">Loading…</div>}
        {!isLoading && filtered.length === 0 && (
          <div className="p-12 text-center text-sm text-muted-foreground">
            <Bell className="h-8 w-8 mx-auto mb-3 opacity-40" />
            No notifications match your filter.
          </div>
        )}
        {filtered.map((n) => (
          <div
            key={n.id}
            className={`p-4 flex items-start gap-3 hover:bg-accent/30 transition ${!n.read_at ? "bg-primary/5" : ""}`}
          >
            {!n.read_at && <span className="mt-2 h-2 w-2 rounded-full bg-primary shrink-0" />}
            {n.read_at && <span className="mt-2 h-2 w-2 rounded-full bg-muted shrink-0" />}
            <button className="flex-1 min-w-0 text-left" onClick={() => openItem(n)}>
              <div className="flex flex-wrap items-center gap-2">
                <div className="font-medium text-sm">{n.title}</div>
                <Badge variant="outline" className={`text-[10px] border-0 ${badgeColor(n.type)}`}>
                  {n.type.split(":")[0].replace(/_/g, " ")}
                </Badge>
              </div>
              {n.message && <div className="text-xs text-muted-foreground mt-1">{n.message}</div>}
              <div className="text-[10px] text-muted-foreground mt-1">
                {new Date(n.created_at).toLocaleString()}
              </div>
            </button>
            <div className="flex items-center gap-1 shrink-0">
              {!n.read_at && (
                <Button variant="ghost" size="sm" onClick={() => markRead.mutate(n.id)} title="Mark as read">
                  <CheckCheck className="h-4 w-4" />
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={() => remove.mutate(n.id)} title="Delete">
                <Trash2 className="h-4 w-4 text-muted-foreground" />
              </Button>
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}

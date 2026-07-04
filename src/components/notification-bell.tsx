import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/lib/use-current-user";
import { useActiveTenantId } from "@/lib/tenant";
import { useNavigate } from "@tanstack/react-router";

type Notification = {
  id: string;
  tenant_id: string;
  user_id: string | null;
  type: string;
  title: string;
  message: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
};

export function NotificationBell() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { user, isSuperAdmin } = useCurrentUser();
  const tenantId = useActiveTenantId();

  // Refresh derived alerts (low stock, overdue, expiring) periodically
  useEffect(() => {
    if (!tenantId || isSuperAdmin) return;
    supabase.rpc("refresh_tenant_alerts", { _tenant: tenantId });
  }, [tenantId, isSuperAdmin]);

  const { data: items = [] } = useQuery({
    queryKey: ["notifications", user?.id, tenantId, isSuperAdmin],
    enabled: !!user,
    refetchInterval: 30_000,
    queryFn: async () => {
      let q = supabase
        .from("notifications")
        .select("id, tenant_id, user_id, type, title, message, link, read_at, created_at")
        .order("created_at", { ascending: false })
        .limit(30);
      if (!isSuperAdmin && tenantId) q = q.eq("tenant_id", tenantId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Notification[];
    },
  });

  const unread = items.filter((n) => !n.read_at).length;

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const markAll = useMutation({
    mutationFn: async () => {
      const ids = items.filter((n) => !n.read_at).map((n) => n.id);
      if (!ids.length) return;
      await supabase.from("notifications").update({ read_at: new Date().toISOString() }).in("id", ids);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <Badge className="absolute -top-1 -right-1 h-5 min-w-5 px-1 rounded-full text-[10px] bg-red-500 text-white border-0 grid place-items-center">
              {unread > 9 ? "9+" : unread}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-96 p-0">
        <div className="flex items-center justify-between px-3 py-2 border-b">
          <div className="text-sm font-semibold">Notifications</div>
          {unread > 0 && (
            <button className="text-xs text-primary hover:underline" onClick={() => markAll.mutate()}>
              Mark all read
            </button>
          )}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {items.length === 0 && (
            <div className="p-6 text-center text-sm text-muted-foreground">No notifications</div>
          )}
          {items.map((n) => (
            <button
              key={n.id}
              onClick={() => {
                if (!n.read_at) markRead.mutate(n.id);
                if (n.link) navigate({ to: n.link });
              }}
              className={`w-full text-left px-3 py-2 border-b hover:bg-accent transition ${!n.read_at ? "bg-primary/5" : ""}`}
            >
              <div className="flex items-start gap-2">
                {!n.read_at && <span className="mt-1.5 h-2 w-2 rounded-full bg-primary shrink-0" />}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{n.title}</div>
                  {n.message && <div className="text-xs text-muted-foreground mt-0.5">{n.message}</div>}
                  <div className="text-[10px] text-muted-foreground mt-1">
                    {new Date(n.created_at).toLocaleString()}
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

import { createFileRoute, Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard, Users, Package, FileText, Receipt, CreditCard, FileSignature,
  BarChart3, Settings, LogOut, Search, Building2, ShieldCheck, LayoutGrid, Tag, Sparkles, Bell, Wallet,
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader, SidebarFooter,
  SidebarProvider, SidebarTrigger, useSidebar,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Toaster } from "@/components/ui/sonner";
import { NotificationBell } from "@/components/notification-bell";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/lib/use-current-user";
import { useActiveTenant } from "@/lib/tenant";
import type { ReactNode } from "react";

const workspaceNav = [
  { title: "Dashboard", to: "/dashboard", icon: LayoutDashboard },
  { title: "Customers", to: "/customers", icon: Users },
  { title: "Products", to: "/products", icon: Package },
  { title: "Quotations", to: "/quotations", icon: FileSignature },
  { title: "Invoices", to: "/invoices", icon: FileText },
  { title: "Receipts", to: "/receipts", icon: Receipt },
  { title: "Payments", to: "/payments", icon: CreditCard },
  { title: "Expenses", to: "/expenses", icon: Wallet },
  { title: "Reports", to: "/reports", icon: BarChart3 },
  { title: "Notifications", to: "/notifications", icon: Bell },
] as const;

const adminNav = [
  { title: "Overview", to: "/admin", icon: LayoutGrid },
  { title: "Businesses", to: "/admin/tenants", icon: Building2 },
  { title: "Plans", to: "/admin/plans", icon: Tag },
] as const;

function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { isSuperAdmin } = useCurrentUser();
  const { tenant, role } = useActiveTenant();

  const isActive = (to: string) =>
    to === "/admin"
      ? pathname === "/admin"
      : to === "/dashboard"
        ? pathname === "/dashboard" || pathname === "/"
        : pathname === to || pathname.startsWith(to + "/");

  const showWorkspace = !isSuperAdmin && !!tenant;
  const showAdmin = isSuperAdmin;

  return (
    <Sidebar collapsible="icon" className="border-r">
      <SidebarHeader className="border-b border-sidebar-border px-3 py-4">
        <div className="flex items-center gap-2">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg gradient-emerald text-white shadow-soft">
            <span className="text-base font-bold">SI</span>
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <div className="truncate text-sm font-bold leading-tight">
                {isSuperAdmin ? "Platform Admin" : tenant?.business_name || "SmartInvoice Pro"}
              </div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {isSuperAdmin ? "SaaS control center" : role || "Workspace"}
              </div>
            </div>
          )}
        </div>
      </SidebarHeader>
      <SidebarContent>
        {showWorkspace && (
          <SidebarGroup>
            <SidebarGroupLabel>Workspace</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {workspaceNav.map((item) => (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton asChild isActive={isActive(item.to)} tooltip={item.title}>
                      <Link to={item.to} className="flex items-center gap-2">
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
        {showWorkspace && (role === "owner" || role === "manager") && (
          <SidebarGroup>
            <SidebarGroupLabel>Business</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={isActive("/settings")} tooltip="Settings">
                    <Link to="/settings" className="flex items-center gap-2">
                      <Settings className="h-4 w-4" /><span>Settings</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                {role === "owner" && (
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={isActive("/billing")} tooltip="Billing">
                      <Link to="/billing" className="flex items-center gap-2">
                        <Sparkles className="h-4 w-4" /><span>Billing & Plan</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
        {showAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel>Super Admin</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {adminNav.map((item) => (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton asChild isActive={isActive(item.to)} tooltip={item.title}>
                      <Link to={item.to} className="flex items-center gap-2">
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border p-3">
        <div className="text-[10px] text-muted-foreground flex items-center gap-1.5">
          {isSuperAdmin ? <><ShieldCheck className="h-3 w-3" />Super admin</> : <>{tenant?.currency || "UGX"} • {tenant?.status}</>}
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

function Topbar() {
  const navigate = useNavigate();
  const { user } = useCurrentUser();
  const { tenant, memberships } = useActiveTenant();
  const initials = (user?.email || "U").slice(0, 2).toUpperCase();
  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-card/80 px-4 backdrop-blur supports-[backdrop-filter]:bg-card/60">
      <SidebarTrigger />
      {tenant && (
        <Badge variant="outline" className="hidden md:inline-flex gap-1.5 text-xs">
          <Building2 className="h-3 w-3" />{tenant.business_name}
          {memberships.length > 1 && <span className="opacity-60">+{memberships.length - 1}</span>}
        </Badge>
      )}
      <div className="relative hidden md:block flex-1 max-w-md">
        <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search…" className="h-9 pl-8 bg-background" />
      </div>
      <div className="ml-auto flex items-center gap-2">
        <NotificationBell />
        <div className="flex items-center gap-2 rounded-lg border bg-background px-2 py-1">
          <Avatar className="h-7 w-7">
            <AvatarFallback className="text-xs bg-primary text-primary-foreground">{initials}</AvatarFallback>
          </Avatar>
          <div className="hidden md:block">
            <div className="text-xs font-semibold leading-tight">{user?.email}</div>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={signOut} title="Sign out">
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <div className="flex flex-1 flex-col min-w-0">
          <Topbar />
          <main className="flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
        </div>
      </div>
      <Toaster richColors position="top-right" />
    </SidebarProvider>
  );
}

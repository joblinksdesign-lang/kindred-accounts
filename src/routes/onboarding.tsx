import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { Building2, Clock, CheckCircle2, ArrowRight } from "lucide-react";

type ExistingTenant = {
  id: string;
  business_name: string;
  email: string;
  status: "pending" | "active" | "suspended" | "expired" | "cancelled";
  created_at: string;
};

export const Route = createFileRoute("/onboarding")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    // Super admins manage the platform — never run onboarding.
    const { data: roles } = await supabase
      .from("user_roles").select("role").eq("user_id", data.user.id);
    if ((roles ?? []).some((r) => r.role === "super_admin")) {
      throw redirect({ to: "/admin" });
    }
  },
  head: () => ({ meta: [{ title: "Register your business — SmartInvoice Pro" }] }),
  component: OnboardingPage,
});

const CURRENCIES: Array<[string, string]> = [
  ["USD", "$"], ["EUR", "€"], ["GBP", "£"], ["UGX", "USh"], ["KES", "KSh"],
  ["TZS", "TSh"], ["NGN", "₦"], ["ZAR", "R"], ["GHS", "₵"], ["INR", "₹"],
];

function OnboardingPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [currency, setCurrency] = useState("USD");
  const [existing, setExisting] = useState<ExistingTenant | null>(null);
  const [checking, setChecking] = useState(true);

  const loadExisting = async () => {
    setChecking(true);
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes.user?.id;
      if (!uid) { setExisting(null); return; }

      // Primary: tenants the user owns (covers pending tenants reliably).
      const { data: owned, error: ownedError } = await supabase
        .from("tenants")
        .select("id, business_name, email, status, created_at")
        .eq("owner_user_id", uid)
        .order("created_at", { ascending: false })
        .limit(1);
      if (ownedError) throw ownedError;
      if (owned && owned.length > 0) {
        setExisting(owned[0] as ExistingTenant);
        return;
      }

      // Fallback: any tenant membership.
      const { data: membership, error: membershipError } = await supabase
        .from("tenant_users")
        .select("tenant_id")
        .eq("user_id", uid)
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(1);
      if (membershipError) throw membershipError;
      const tid = membership?.[0]?.tenant_id;
      if (!tid) { setExisting(null); return; }
      const { data: t, error: tenantError } = await supabase
        .from("tenants")
        .select("id, business_name, email, status, created_at")
        .eq("id", tid)
        .maybeSingle();
      if (tenantError) throw tenantError;
      setExisting((t as ExistingTenant) ?? null);
    } catch (err) {
      console.error("Unable to load business registration", err);
      setExisting(null);
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => { loadExisting(); }, []);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const symbol = CURRENCIES.find(([c]) => c === currency)?.[1] ?? "$";
    try {
      const businessName = String(fd.get("business_name"));
      const email = String(fd.get("email"));
      const { data: tenantId, error } = await supabase.rpc("register_business", {
        _business_name: businessName,
        _email: email,
        _phone: String(fd.get("phone") || ""),
        _country: String(fd.get("country") || ""),
        _currency: currency,
        _currency_symbol: symbol,
      });
      if (error) throw error;
      toast.success("Business submitted! Awaiting platform approval.");
      setExisting({
        id: String(tenantId ?? "pending"),
        business_name: businessName,
        email,
        status: "pending",
        created_at: new Date().toISOString(),
      });
      await loadExisting();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <div className="min-h-screen bg-background grid place-items-center p-6">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (existing) {
    const isPending = existing.status === "pending";
    const isActive = existing.status === "active";
    return (
      <div className="min-h-screen bg-background grid place-items-center p-6">
        <Toaster richColors position="top-right" />
        <Card className="w-full max-w-xl p-8 shadow-elevated border-0 text-center">
          <div className={`mx-auto grid h-14 w-14 place-items-center rounded-full ${isActive ? "bg-emerald-500/10 text-emerald-600" : "bg-amber-500/10 text-amber-600"}`}>
            {isActive ? <CheckCircle2 className="h-7 w-7" /> : <Clock className="h-7 w-7" />}
          </div>
          <h1 className="mt-4 text-2xl font-bold">
            {isActive ? "Your business is approved" : "Submission received"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {isActive
              ? "Welcome aboard. You can jump into your dashboard now."
              : isPending
                ? "Thanks! Your business details were submitted and are awaiting platform admin approval. You'll be notified once approved."
                : `Status: ${existing.status}. Please contact support if this looks wrong.`}
          </p>
          <div className="mt-6 rounded-lg border border-border bg-muted/40 p-4 text-left">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Business</div>
            <div className="mt-1 flex items-center justify-between">
              <div>
                <div className="font-semibold">{existing.business_name}</div>
                <div className="text-xs text-muted-foreground">{existing.email}</div>
              </div>
              <Badge variant="outline" className="capitalize">{existing.status}</Badge>
            </div>
          </div>
          <div className="mt-6 flex gap-2 justify-center flex-wrap">
            {isActive && (
              <Button
                onClick={() => { window.location.href = "/dashboard"; }}
                className="gradient-emerald text-white shadow-soft"
              >
                Go to dashboard <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            )}
            {!isActive && (
              <Button variant="outline" onClick={() => loadExisting()}>Refresh status</Button>
            )}
            <Button
              variant="ghost"
              onClick={async () => {
                await supabase.auth.signOut();
                navigate({ to: "/auth", replace: true });
              }}
            >
              Sign out
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background grid place-items-center p-6">
      <Toaster richColors position="top-right" />
      <Card className="w-full max-w-2xl p-8 shadow-elevated border-0">
        <div className="flex items-center gap-3 mb-6">
          <div className="grid h-12 w-12 place-items-center rounded-xl gradient-emerald text-white shadow-soft">
            <Building2 className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Register your business</h1>
            <p className="text-sm text-muted-foreground">Set up your workspace. You'll start on the Free plan.</p>
          </div>
        </div>
        <form onSubmit={submit} className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <Label>Business name *</Label>
            <Input name="business_name" required placeholder="Acme Trading Co." />
          </div>
          <div className="col-span-1">
            <Label>Business email *</Label>
            <Input name="email" type="email" required />
          </div>
          <div className="col-span-1">
            <Label>Phone</Label>
            <Input name="phone" />
          </div>
          <div className="col-span-1">
            <Label>Country</Label>
            <Input name="country" placeholder="Uganda" />
          </div>
          <div className="col-span-1">
            <Label>Currency</Label>
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CURRENCIES.map(([c, s]) => (
                  <SelectItem key={c} value={c}>{c} ({s})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2 mt-2">
            <Button type="submit" disabled={loading} className="w-full h-11 gradient-emerald text-white shadow-soft">
              {loading ? "Submitting…" : "Submit for approval"}
            </Button>
            <p className="mt-3 text-xs text-muted-foreground text-center">
              Your business will be pending approval by a platform admin.
            </p>
          </div>
        </form>
      </Card>
    </div>
  );
}

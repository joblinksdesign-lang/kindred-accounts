import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-helpers";
import { useActiveTenant } from "@/lib/tenant";
import { Check, Sparkles, ArrowRight } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/billing")({
  head: () => ({ meta: [{ title: "Billing & Plan" }] }),
  component: BillingPage,
  errorComponent: ({ error }) => (
    <div className="p-8 text-sm text-destructive">{error.message}</div>
  ),
  notFoundComponent: () => <div className="p-8 text-sm">Not found</div>,
});

type Plan = {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  description: string | null;
  price_monthly: number;
  price_annual: number;
  trial_days: number;
  features: string[];
};

type Subscription = {
  id: string;
  plan_id: string;
  status: string;
  billing_cycle: "monthly" | "annual";
  current_period_end: string | null;
  pending_plan_id: string | null;
  pending_billing_cycle: "monthly" | "annual" | null;
  pending_requested_at: string | null;
};

function BillingPage() {
  const qc = useQueryClient();
  const { tenantId, role } = useActiveTenant();
  const [annual, setAnnual] = useState(false);
  const isOwner = role === "owner";

  const { data: plans = [] } = useQuery({
    queryKey: ["billing_plans"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("plans")
        .select("id, slug, name, tagline, description, price_monthly, price_annual, trial_days, features")
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []).map((p) => ({ ...p, features: (p.features as string[]) ?? [] })) as Plan[];
    },
  });

  const { data: sub } = useQuery({
    queryKey: ["my_subscription", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscriptions")
        .select("id, plan_id, status, billing_cycle, current_period_end, pending_plan_id, pending_billing_cycle, pending_requested_at")
        .eq("tenant_id", tenantId!)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as Subscription | null;
    },
  });

  const requestPlan = useMutation({
    mutationFn: async (planId: string) => {
      if (!tenantId) throw new Error("No active business selected");
      if (!isOwner) throw new Error("Only the business owner can change the plan");
      const cycle = annual ? "annual" : "monthly";
      if (sub) {
        // Same plan + cycle already active → nothing to do
        if (sub.plan_id === planId && sub.billing_cycle === cycle && !sub.pending_plan_id) {
          throw new Error("You are already on this plan");
        }
        const { error } = await supabase
          .from("subscriptions")
          .update({
            pending_plan_id: planId,
            pending_billing_cycle: cycle,
            pending_requested_at: new Date().toISOString(),
          })
          .eq("id", sub.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("subscriptions")
          .insert({
            tenant_id: tenantId,
            plan_id: planId,
            billing_cycle: cycle,
            status: "trialing",
            pending_plan_id: planId,
            pending_billing_cycle: cycle,
            pending_requested_at: new Date().toISOString(),
          } as never);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Plan change request submitted", {
        description: "Your request has been sent to the super admin for approval. You'll be notified once activated.",
      });
      qc.invalidateQueries({ queryKey: ["my_subscription"] });
    },
    onError: (e: Error) =>
      toast.error("Could not submit plan request", {
        description: e.message || "Please try again in a moment.",
      }),
  });

  const cancelRequest = useMutation({
    mutationFn: async () => {
      if (!sub) return;
      const { error } = await supabase
        .from("subscriptions")
        .update({ pending_plan_id: null, pending_billing_cycle: null, pending_requested_at: null })
        .eq("id", sub.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Request cancelled");
      qc.invalidateQueries({ queryKey: ["my_subscription"] });
    },
  });

  const currentPlan = plans.find((p) => p.id === sub?.plan_id);

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Billing & Plan"
        subtitle="Upgrade or change your subscription at any time."
      />

      {sub && currentPlan && (
        <Card className="p-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Current plan</div>
            <div className="text-lg font-bold flex items-center gap-2">
              {currentPlan.name}
              <Badge variant="secondary">{sub.billing_cycle}</Badge>
              <Badge>{sub.status}</Badge>
            </div>
            {sub.current_period_end && (
              <div className="text-xs text-muted-foreground mt-1">
                Renews {new Date(sub.current_period_end).toLocaleDateString()}
              </div>
            )}
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border bg-card p-1">
            <button
              onClick={() => setAnnual(false)}
              className={`px-4 py-1.5 text-sm rounded-full transition ${!annual ? "gradient-emerald text-white shadow-soft" : "text-muted-foreground"}`}
            >Monthly</button>
            <button
              onClick={() => setAnnual(true)}
              className={`px-4 py-1.5 text-sm rounded-full transition ${annual ? "gradient-emerald text-white shadow-soft" : "text-muted-foreground"}`}
            >Annual <span className="ml-1 text-[10px] opacity-80">Save 17%</span></button>
          </div>
        </Card>
      )}

      {sub?.pending_plan_id && (
        <Card className="p-4 flex flex-wrap items-center justify-between gap-3 border-amber-500/40 bg-amber-500/5">
          <div className="text-sm">
            <span className="font-semibold">Pending approval:</span>{" "}
            switch to <b>{plans.find((p) => p.id === sub.pending_plan_id)?.name ?? "new plan"}</b>{" "}
            ({sub.pending_billing_cycle}). Waiting for admin activation.
          </div>
          {isOwner && (
            <Button size="sm" variant="outline" onClick={() => cancelRequest.mutate()} disabled={cancelRequest.isPending}>
              Cancel request
            </Button>
          )}
        </Card>
      )}

      {!isOwner && (
        <Card className="p-4 text-sm text-muted-foreground">
          Only the business owner can change the plan.
        </Card>
      )}

      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
        {plans.map((p) => {
          const price = annual ? p.price_annual / 12 : p.price_monthly;
          const isCurrent = sub?.plan_id === p.id && (sub?.billing_cycle === (annual ? "annual" : "monthly"));
          const isPending = sub?.pending_plan_id === p.id;
          const highlight = p.slug === "professional";
          return (
            <Card key={p.id} className={`p-6 flex flex-col border ${highlight ? "border-primary ring-1 ring-primary/30" : ""}`}>
              {highlight && <Badge className="self-start mb-3 gradient-emerald text-white border-0"><Sparkles className="h-3 w-3 mr-1" />{p.tagline || "Most popular"}</Badge>}
              <h3 className="text-lg font-bold">{p.name}</h3>
              <p className="text-xs text-muted-foreground mt-1 min-h-[36px]">{p.description}</p>
              <div className="mt-4">
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-extrabold">USh {price.toLocaleString()}</span>
                  <span className="text-xs text-muted-foreground">/mo</span>
                </div>
                {annual && p.price_annual > 0 && (
                  <div className="text-[11px] text-muted-foreground mt-0.5">Billed USh {p.price_annual.toLocaleString()} yearly</div>
                )}
              </div>
              <ul className="mt-5 space-y-2 flex-1">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm">
                    <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <Button
                className={`mt-5 w-full ${highlight && !isCurrent && !isPending ? "gradient-emerald text-white" : ""}`}
                variant={isCurrent ? "secondary" : isPending ? "outline" : highlight ? "default" : "outline"}
                disabled={!isOwner || isCurrent || isPending || requestPlan.isPending}
                onClick={() => requestPlan.mutate(p.id)}
              >
                {isCurrent ? "Current plan" : isPending ? "Pending approval" : (
                  <>Request {p.name} <ArrowRight className="ml-1.5 h-4 w-4" /></>
                )}
              </Button>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

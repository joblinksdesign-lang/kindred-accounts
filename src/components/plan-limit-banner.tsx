import { Link } from "@tanstack/react-router";
import { AlertTriangle, Sparkles, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { usePlanLimits } from "@/lib/plan-limits";
import { useState } from "react";

function Row({ label, used, limit }: { label: string; used: number; limit: number | null }) {
  if (limit == null || limit <= 0) return null;
  const pct = Math.min(100, Math.round((used / limit) * 100));
  const over = used >= limit;
  const near = !over && used >= Math.floor(limit * 0.8);
  const color = over ? "bg-red-500" : near ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div className="text-xs">
      <div className="flex justify-between">
        <span className="text-muted-foreground">{label}</span>
        <span className={over ? "text-red-600 font-semibold" : "font-medium"}>
          {used} / {limit}
        </span>
      </div>
      <div className="h-1.5 mt-1 rounded-full bg-muted overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function PlanLimitBanner() {
  const { data } = usePlanLimits();
  const [dismissed, setDismissed] = useState(false);

  if (!data || !data.hasAnyLimit || dismissed) return null;
  if (!data.anyOver && !data.anyNear) return null;

  const critical = data.anyOver;

  return (
    <Card
      className={`p-4 border-l-4 ${
        critical
          ? "border-l-red-500 bg-red-500/5"
          : "border-l-amber-500 bg-amber-500/5"
      }`}
    >
      <div className="flex items-start gap-3">
        <div className={`grid place-items-center h-9 w-9 rounded-lg ${critical ? "bg-red-500/15 text-red-600" : "bg-amber-500/15 text-amber-600"}`}>
          <AlertTriangle className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="font-semibold text-sm">
              {critical
                ? "You've reached your plan limits"
                : "You're nearing your plan limits"}
              {data.planName && <span className="text-muted-foreground font-normal"> — {data.planName}</span>}
            </div>
            <button
              onClick={() => setDismissed(true)}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {critical
              ? "Upgrade your plan to keep creating invoices, customers, and products without interruption."
              : "Consider upgrading before you hit the ceiling to avoid disruptions."}
          </p>
          <div className="grid gap-2 sm:grid-cols-2 mt-3">
            <Row label="Invoices this month" used={data.invoicesThisMonth} limit={data.maxInvoicesPerMonth} />
            <Row label="Customers" used={data.customers} limit={data.maxCustomers} />
            <Row label="Products" used={data.products} limit={data.maxProducts} />
            <Row label="Team members" used={data.users} limit={data.maxUsers} />
          </div>
          <div className="mt-3">
            <Button asChild size="sm" className="gradient-emerald text-white">
              <Link to="/billing">
                <Sparkles className="h-4 w-4 mr-1.5" />
                Upgrade plan
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

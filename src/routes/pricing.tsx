import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Sparkles, ArrowRight } from "lucide-react";
import { motion } from "framer-motion";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Pricing — SmartInvoice Pro" },
      { name: "description", content: "Simple, transparent pricing for businesses of every size. Manage invoices, receipts, inventory and payments from one place." },
    ],
  }),
  component: PricingPage,
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
  is_default: boolean;
  sort_order: number;
};

function PricingPage() {
  const [annual, setAnnual] = useState(false);
  const { data: plans = [] } = useQuery({
    queryKey: ["public_plans"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("plans")
        .select("id, slug, name, tagline, description, price_monthly, price_annual, trial_days, features, is_default, sort_order")
        .eq("is_active", true)
        .eq("is_public", true)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []).map((p) => ({ ...p, features: (p.features as string[]) ?? [] })) as Plan[];
    },
  });

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b bg-card/80 backdrop-blur">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-2">
            <div className="grid h-9 w-9 place-items-center rounded-lg gradient-emerald text-white shadow-soft font-bold">GP</div>
            <div>
              <div className="text-sm font-bold leading-tight">SmartInvoice Pro</div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">by Growth Point</div>
            </div>
          </Link>
          <nav className="flex items-center gap-3">
            <Link to="/auth" className="text-sm font-medium text-muted-foreground hover:text-foreground">Sign in</Link>
            <Link to="/auth"><Button size="sm" className="gradient-emerald text-white">Get started</Button></Link>
          </nav>
        </div>
      </header>

      <section className="container mx-auto px-4 pt-16 pb-10 text-center">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <Badge className="mb-4" variant="secondary"><Sparkles className="h-3 w-3 mr-1" />Pricing</Badge>
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight max-w-3xl mx-auto">
            Pick the plan that grows with your business
          </h1>
          <p className="mt-4 text-muted-foreground max-w-xl mx-auto">
            Start free, upgrade anytime. Every plan includes invoices, receipts, customers, products and PDF exports.
          </p>
        </motion.div>

        <div className="mt-8 inline-flex items-center gap-2 rounded-full border bg-card p-1">
          <button
            onClick={() => setAnnual(false)}
            className={`px-4 py-1.5 text-sm rounded-full transition ${!annual ? "gradient-emerald text-white shadow-soft" : "text-muted-foreground"}`}
          >
            Monthly
          </button>
          <button
            onClick={() => setAnnual(true)}
            className={`px-4 py-1.5 text-sm rounded-full transition ${annual ? "gradient-emerald text-white shadow-soft" : "text-muted-foreground"}`}
          >
            Annual <span className="ml-1 text-[10px] opacity-80">Save 17%</span>
          </button>
        </div>
      </section>

      <section className="container mx-auto px-4 pb-20">
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {plans.map((p, i) => {
            const price = annual ? p.price_annual / 12 : p.price_monthly;
            const highlight = p.slug === "professional";
            return (
              <motion.div
                key={p.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: i * 0.06 }}
              >
                <Card className={`p-6 h-full flex flex-col border ${highlight ? "border-primary shadow-elevated ring-1 ring-primary/30" : "shadow-soft"}`}>
                  {highlight && <Badge className="self-start mb-3 gradient-emerald text-white border-0">{p.tagline || "Most popular"}</Badge>}
                  <h3 className="text-xl font-bold">{p.name}</h3>
                  <p className="text-sm text-muted-foreground mt-1 min-h-[40px]">{p.description}</p>
                  <div className="mt-5">
                    <div className="flex items-baseline gap-1">
                      <span className="text-4xl font-extrabold">USh {price.toLocaleString()}</span>
                      <span className="text-sm text-muted-foreground">/mo</span>
                    </div>
                    {annual && p.price_annual > 0 && (
                      <div className="text-xs text-muted-foreground mt-1">Billed USh {p.price_annual.toLocaleString()} yearly</div>
                    )}
                    {p.trial_days > 0 && (
                      <div className="text-xs text-primary mt-1 font-medium">{p.trial_days}-day free trial</div>
                    )}
                  </div>
                  <ul className="mt-6 space-y-2.5 flex-1">
                    {p.features.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-sm">
                        <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                  <Link to="/auth" className="mt-6">
                    <Button className={`w-full ${highlight ? "gradient-emerald text-white" : ""}`} variant={highlight ? "default" : "outline"}>
                      {p.price_monthly === 0 ? "Start free" : "Choose plan"} <ArrowRight className="ml-1.5 h-4 w-4" />
                    </Button>
                  </Link>
                </Card>
              </motion.div>
            );
          })}
        </div>
      </section>

      <footer className="border-t bg-card/40">
        <div className="container mx-auto px-4 py-6 text-xs text-muted-foreground flex items-center justify-between">
          <span>© {new Date().getFullYear()} Growth Point — SmartInvoice Pro</span>
          <Link to="/auth" className="hover:text-foreground">Sign in →</Link>
        </div>
      </footer>
    </div>
  );
}

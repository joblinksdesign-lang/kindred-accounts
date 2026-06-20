import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { Building2 } from "lucide-react";

export const Route = createFileRoute("/onboarding")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
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

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const symbol = CURRENCIES.find(([c]) => c === currency)?.[1] ?? "$";
    try {
      const { error } = await supabase.rpc("register_business", {
        _business_name: String(fd.get("business_name")),
        _email: String(fd.get("email")),
        _phone: String(fd.get("phone") || ""),
        _country: String(fd.get("country") || ""),
        _currency: currency,
        _currency_symbol: symbol,
      });
      if (error) throw error;
      toast.success("Business registered! Awaiting platform approval.");
      navigate({ to: "/dashboard", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  };

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
              {loading ? "Creating workspace…" : "Create business"}
            </Button>
            <p className="mt-3 text-xs text-muted-foreground text-center">
              Your business will be pending approval. You can start configuring it right away.
            </p>
          </div>
        </form>
      </Card>
    </div>
  );
}

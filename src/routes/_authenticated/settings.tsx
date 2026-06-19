import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/page-helpers";
import { useCompanySettings } from "@/lib/company";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import { Building2, Palette, FileText } from "lucide-react";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const qc = useQueryClient();
  const { data: company } = useCompanySettings();
  const [form, setForm] = useState<Record<string, unknown>>({});

  useEffect(() => { if (company) setForm(company as unknown as Record<string, unknown>); }, [company]);

  const save = useMutation({
    mutationFn: async () => {
      if (!company) return;
      const payload = { ...form };
      delete payload.id;
      const { error } = await supabase.from("company_settings").update(payload as never).eq("id", company.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Settings saved"); qc.invalidateQueries({ queryKey: ["company_settings"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const set = (k: string, v: unknown) => setForm((p) => ({ ...p, [k]: v }));

  if (!company) return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;

  const TemplateCard = ({ template, name, kind, description, selected, onSelect }: {
    template: string; name: string; kind: "invoice" | "receipt"; description: string; selected: boolean; onSelect: () => void;
  }) => (
    <button type="button" onClick={onSelect}
      className={`text-left rounded-lg border-2 p-4 transition-all ${selected ? "border-primary bg-primary/5 shadow-soft" : "border-border hover:border-muted-foreground/30"}`}>
      <div className="aspect-[4/3] rounded-md bg-card overflow-hidden mb-3 relative border">
        {template === "classic" ? (
          <div className="absolute inset-0 flex flex-col">
            <div className="h-6 gradient-emerald" />
            <div className="p-2 flex-1">
              <div className="h-2 w-2/3 bg-muted-foreground/30 rounded mb-1" />
              <div className="h-1.5 w-1/3 bg-muted-foreground/20 rounded mb-3" />
              <div className="space-y-1">{[1,2,3].map((i) => <div key={i} className="h-1 bg-muted-foreground/15 rounded" />)}</div>
              <div className="mt-3 h-2 w-1/4 bg-primary/40 rounded ml-auto" />
            </div>
          </div>
        ) : (
          <div className="absolute inset-0 flex">
            <div className="w-1.5 bg-[var(--gold)]" />
            <div className="p-2 flex-1">
              <div className="h-3 w-1/2 bg-muted-foreground/40 rounded mb-2" />
              <div className="h-1.5 w-1/4 bg-muted-foreground/20 rounded mb-3" />
              <div className="space-y-1">{[1,2,3].map((i) => <div key={i} className="h-1 bg-muted-foreground/15 rounded" />)}</div>
              <div className="mt-3 h-2 w-1/4 bg-primary/40 rounded ml-auto" />
            </div>
          </div>
        )}
      </div>
      <div className="text-sm font-semibold">{name}</div>
      <div className="text-xs text-muted-foreground">{description}</div>
      <div className="text-[10px] mt-1 uppercase tracking-wider text-muted-foreground">{kind} template</div>
    </button>
  );

  return (
    <div className="max-w-4xl mx-auto">
      <PageHeader title="Settings" subtitle="Configure company branding, defaults and document templates." />
      <Tabs defaultValue="company" className="space-y-4">
        <TabsList>
          <TabsTrigger value="company"><Building2 className="h-3.5 w-3.5 mr-1.5" />Company</TabsTrigger>
          <TabsTrigger value="invoicing"><FileText className="h-3.5 w-3.5 mr-1.5" />Invoicing</TabsTrigger>
          <TabsTrigger value="templates"><Palette className="h-3.5 w-3.5 mr-1.5" />Templates</TabsTrigger>
        </TabsList>

        <TabsContent value="company">
          <Card className="p-6 shadow-soft border-0 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Company name</Label><Input value={String(form.company_name || "")} onChange={(e) => set("company_name", e.target.value)} /></div>
              <div><Label>Legal name</Label><Input value={String(form.legal_name || "")} onChange={(e) => set("legal_name", e.target.value)} /></div>
              <div><Label>Email</Label><Input type="email" value={String(form.email || "")} onChange={(e) => set("email", e.target.value)} /></div>
              <div><Label>Phone</Label><Input value={String(form.phone || "")} onChange={(e) => set("phone", e.target.value)} /></div>
              <div><Label>Website</Label><Input value={String(form.website || "")} onChange={(e) => set("website", e.target.value)} /></div>
              <div><Label>Tax ID</Label><Input value={String(form.tax_id || "")} onChange={(e) => set("tax_id", e.target.value)} /></div>
              <div className="col-span-2"><Label>Address</Label><Input value={String(form.address || "")} onChange={(e) => set("address", e.target.value)} /></div>
              <div><Label>City</Label><Input value={String(form.city || "")} onChange={(e) => set("city", e.target.value)} /></div>
              <div><Label>Country</Label><Input value={String(form.country || "")} onChange={(e) => set("country", e.target.value)} /></div>
              <div className="col-span-2"><Label>Logo URL</Label><Input value={String(form.logo_url || "")} onChange={(e) => set("logo_url", e.target.value)} placeholder="https://…" /></div>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="invoicing">
          <Card className="p-6 shadow-soft border-0 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Currency code</Label><Input value={String(form.currency || "USD")} onChange={(e) => set("currency", e.target.value)} maxLength={4} /></div>
              <div><Label>Currency symbol</Label><Input value={String(form.currency_symbol || "$")} onChange={(e) => set("currency_symbol", e.target.value)} maxLength={4} /></div>
              <div><Label>Default tax rate %</Label><Input type="number" step="0.01" value={Number(form.default_tax_rate || 0)} onChange={(e) => set("default_tax_rate", Number(e.target.value))} /></div>
              <div></div>
              <div><Label>Invoice prefix</Label><Input value={String(form.invoice_prefix || "INV")} onChange={(e) => set("invoice_prefix", e.target.value)} /></div>
              <div><Label>Receipt prefix</Label><Input value={String(form.receipt_prefix || "REC")} onChange={(e) => set("receipt_prefix", e.target.value)} /></div>
              <div><Label>Quote prefix</Label><Input value={String(form.quote_prefix || "QUO")} onChange={(e) => set("quote_prefix", e.target.value)} /></div>
              <div></div>
              <div className="col-span-2"><Label>Payment instructions (shown on invoices)</Label>
                <Textarea rows={3} value={String(form.payment_instructions || "")} onChange={(e) => set("payment_instructions", e.target.value)} placeholder="Bank: …  Account: …  Mobile money: …" />
              </div>
              <div className="col-span-2"><Label>Invoice/receipt footer</Label>
                <Textarea rows={2} value={String(form.invoice_footer || "")} onChange={(e) => set("invoice_footer", e.target.value)} placeholder="Thank you for your business." />
              </div>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="templates" className="space-y-4">
          <Card className="p-6 shadow-soft border-0">
            <h3 className="font-semibold mb-1">Invoice templates</h3>
            <p className="text-sm text-muted-foreground mb-4">Choose how invoices look when downloaded as PDF.</p>
            <div className="grid grid-cols-2 gap-4">
              <TemplateCard template="classic" kind="invoice" name="Classic Emerald" description="Bold emerald banner header — formal and confident."
                selected={form.invoice_template === "classic"} onSelect={() => set("invoice_template", "classic")} />
              <TemplateCard template="modern" kind="invoice" name="Modern Accent" description="Minimal layout with a gold side accent."
                selected={form.invoice_template === "modern"} onSelect={() => set("invoice_template", "modern")} />
            </div>
          </Card>
          <Card className="p-6 shadow-soft border-0">
            <h3 className="font-semibold mb-1">Receipt templates</h3>
            <p className="text-sm text-muted-foreground mb-4">Choose how receipts look when downloaded as PDF.</p>
            <div className="grid grid-cols-2 gap-4">
              <TemplateCard template="classic" kind="receipt" name="Classic Emerald" description="Branded banner with payment summary."
                selected={form.receipt_template === "classic"} onSelect={() => set("receipt_template", "classic")} />
              <TemplateCard template="modern" kind="receipt" name="Modern Accent" description="Editorial layout with gold accent strip."
                selected={form.receipt_template === "modern"} onSelect={() => set("receipt_template", "modern")} />
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="flex justify-end mt-6">
        <Button onClick={() => save.mutate()} disabled={save.isPending} className="gradient-emerald text-white shadow-soft">
          {save.isPending ? "Saving…" : "Save settings"}
        </Button>
      </div>
    </div>
  );
}

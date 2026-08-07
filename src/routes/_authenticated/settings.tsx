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
import { useCompanyLogoUrl, useCompanySettings } from "@/lib/company";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { useEffect, useRef, useState } from "react";
import { Building2, Palette, FileText, Upload, X } from "lucide-react";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const qc = useQueryClient();
  const { data: company } = useCompanySettings();
  const { data: logoPreview } = useCompanyLogoUrl(company);
  const fileInputRef = useRef<HTMLInputElement>(null);
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

  const uploadLogo = useMutation({
    mutationFn: async (file: File) => {
      if (!company) throw new Error("Company settings not loaded");
      if (!file.type.startsWith("image/")) throw new Error("Choose an image file");
      const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
      const path = `${company.tenant_id}/company-logo.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("company-assets")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (uploadError) throw uploadError;
      const { error: updateError } = await supabase
        .from("company_settings")
        .update({ logo_path: path, logo_url: null } as never)
        .eq("id", company.id);
      if (updateError) throw updateError;
      return path;
    },
    onSuccess: (path) => {
      setForm((p) => ({ ...p, logo_path: path, logo_url: null }));
      toast.success("Logo uploaded");
      qc.invalidateQueries({ queryKey: ["company_settings"] });
      qc.invalidateQueries({ queryKey: ["company_logo_url"] });
    },
    onError: (e: Error) => toast.error("Logo upload failed", { description: e.message }),
  });

  const removeLogo = useMutation({
    mutationFn: async () => {
      if (!company) throw new Error("Company settings not loaded");
      const { error } = await supabase
        .from("company_settings")
        .update({ logo_path: null, logo_url: null } as never)
        .eq("id", company.id);
      if (error) throw error;
    },
    onSuccess: () => {
      setForm((p) => ({ ...p, logo_path: null, logo_url: null }));
      toast.success("Logo removed");
      qc.invalidateQueries({ queryKey: ["company_settings"] });
      qc.invalidateQueries({ queryKey: ["company_logo_url"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!company) return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;

  const brandColor = String(form.brand_color || "#8CC63F");

  const TemplateCard = ({ template, name, kind, description, selected, onSelect }: {
    template: string; name: string; kind: "invoice" | "receipt"; description: string; selected: boolean; onSelect: () => void;
  }) => (
    <button type="button" onClick={onSelect}
      className={`text-left rounded-lg border-2 p-4 transition-all ${selected ? "border-primary bg-primary/5 shadow-soft" : "border-border hover:border-muted-foreground/30"}`}>
      <div className="aspect-[4/3] rounded-md bg-card overflow-hidden mb-3 relative border">
        {template === "classic" ? (
          <div className="absolute inset-0 flex flex-col">
            <div className="h-6" style={{ background: brandColor }} />
            <div className="p-2 flex-1">
              <div className="h-2 w-2/3 bg-muted-foreground/30 rounded mb-1" />
              <div className="h-1.5 w-1/3 bg-muted-foreground/20 rounded mb-3" />
              <div className="space-y-1">{[1,2,3].map((i) => <div key={i} className="h-1 bg-muted-foreground/15 rounded" />)}</div>
              <div className="mt-3 h-2 w-1/4 rounded ml-auto" style={{ background: brandColor }} />
            </div>
          </div>
        ) : template === "bold" ? (
          <div className="absolute inset-0 flex flex-col">
            <div className="h-2 w-3/4" style={{ background: brandColor }} />
            <div className="relative h-7 bg-foreground">
              <div className="absolute right-2 top-1.5 h-2 w-16 bg-background/80 rounded" />
              <div className="absolute right-2 top-4 h-1.5 w-10 rounded" style={{ background: brandColor }} />
            </div>
            <div className="p-2 flex-1">
              <div className="h-2.5 w-1/3 bg-foreground/80 rounded mb-2" />
              <div className="flex h-2 mb-1">
                <div className="w-1/2 bg-foreground" />
                <div className="w-1/2" style={{ background: brandColor }} />
              </div>
              <div className="space-y-1">{[1,2,3].map((i) => <div key={i} className="h-1 bg-muted-foreground/15 rounded" />)}</div>
              <div className="mt-2 h-2 w-1/3 rounded ml-auto" style={{ background: brandColor }} />
            </div>
            <div className="h-3 bg-foreground" />
          </div>
        ) : (
          <div className="absolute inset-0 flex">
            <div className="w-1.5" style={{ background: brandColor }} />
            <div className="p-2 flex-1">
              <div className="h-3 w-1/2 bg-muted-foreground/40 rounded mb-2" />
              <div className="h-1.5 w-1/4 bg-muted-foreground/20 rounded mb-3" />
              <div className="space-y-1">{[1,2,3].map((i) => <div key={i} className="h-1 bg-muted-foreground/15 rounded" />)}</div>
              <div className="mt-3 h-2 w-1/4 rounded ml-auto" style={{ background: brandColor }} />
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
              <div className="col-span-2"><Label>Tagline (shown on documents)</Label><Input value={String(form.tagline || "")} onChange={(e) => set("tagline", e.target.value)} placeholder="Add tagline here" /></div>

              <div className="col-span-2"><Label>Address</Label><Input value={String(form.address || "")} onChange={(e) => set("address", e.target.value)} /></div>
              <div><Label>City</Label><Input value={String(form.city || "")} onChange={(e) => set("city", e.target.value)} /></div>
              <div><Label>Country</Label><Input value={String(form.country || "")} onChange={(e) => set("country", e.target.value)} /></div>
              <div className="col-span-2 space-y-2">
                <Label>Business logo</Label>
                <div className="flex flex-col gap-3 rounded-lg border bg-background p-3 sm:flex-row sm:items-center">
                  <div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-md border bg-card">
                    {logoPreview ? (
                      <img src={logoPreview} alt={`${company.company_name} logo`} className="h-full w-full object-contain p-1" />
                    ) : (
                      <Building2 className="h-7 w-7 text-muted-foreground" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">Upload a logo for invoices, receipts, reports, and watermarks.</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) uploadLogo.mutate(file);
                          e.currentTarget.value = "";
                        }}
                      />
                      <Button type="button" size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={uploadLogo.isPending}>
                        <Upload className="mr-1.5 h-4 w-4" />{uploadLogo.isPending ? "Uploading…" : "Upload logo"}
                      </Button>
                      {Boolean(form.logo_path || form.logo_url) && (
                        <Button type="button" size="sm" variant="ghost" onClick={() => removeLogo.mutate()} disabled={removeLogo.isPending}>
                          <X className="mr-1.5 h-4 w-4" />Remove
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
                <div>
                  <Label>Logo URL fallback</Label>
                  <Input value={String(form.logo_url || "")} onChange={(e) => set("logo_url", e.target.value)} placeholder="https://…" />
                </div>
              </div>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="invoicing">
          <Card className="p-6 shadow-soft border-0 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Currency code</Label><Input value={String(form.currency || "UGX")} onChange={(e) => set("currency", e.target.value)} maxLength={4} /></div>
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

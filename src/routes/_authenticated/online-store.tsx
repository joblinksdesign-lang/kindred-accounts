import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-helpers";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Copy, ExternalLink, Store, Lock } from "lucide-react";
import { useActiveTenant } from "@/lib/tenant";
import { useCompanySettings } from "@/lib/company";
import { useTenantModules } from "@/lib/modules";

export const Route = createFileRoute("/_authenticated/online-store")({
  head: () => ({
    meta: [
      { title: "Online Store — SmartInvoice Pro" },
      { name: "description", content: "Publish your product catalogue and take WhatsApp orders from customers." },
      { property: "og:title", content: "Online Store — SmartInvoice Pro" },
      { property: "og:description", content: "Publish your product catalogue and take WhatsApp orders from customers." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: OnlineStorePage,
});

function OnlineStorePage() {
  const qc = useQueryClient();
  const { tenant, role } = useActiveTenant();
  const { data: company } = useCompanySettings();
  const { data: modules, isLoading: modulesLoading } = useTenantModules();

  const [form, setForm] = useState({
    store_enabled: false,
    whatsapp_number: "",
    store_headline: "",
    store_about: "",
  });

  useEffect(() => {
    if (!company) return;
    const c = company as unknown as Record<string, unknown>;
    setForm({
      store_enabled: Boolean(c["store_enabled"]),
      whatsapp_number: String(c["whatsapp_number"] ?? ""),
      store_headline: String(c["store_headline"] ?? ""),
      store_about: String(c["store_about"] ?? ""),
    });
  }, [company]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("company_settings")
        .update({
          store_enabled: form.store_enabled,
          whatsapp_number: form.whatsapp_number || null,
          store_headline: form.store_headline || null,
          store_about: form.store_about || null,
        } as never)
        .eq("tenant_id", tenant!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Store settings saved");
      qc.invalidateQueries({ queryKey: ["company_settings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const storeUrl =
    typeof window !== "undefined" && tenant ? `${window.location.origin}/store/${tenant.slug}` : "";

  const canEdit = role === "owner" || role === "manager";
  const enabled = modules?.has("storefront") ?? false;

  return (
    <>
      <PageHeader
        title="Online store"
        subtitle="Show your products online and let customers send you orders on WhatsApp."
      />

      {modulesLoading ? null : !enabled ? (
        <Card className="p-6 shadow-soft border-0">
          <div className="flex items-start gap-3">
            <Lock className="mt-0.5 h-5 w-5 text-muted-foreground" />
            <div>
              <div className="font-semibold">Online store isn't included in your plan</div>
              <p className="mt-1 text-sm text-muted-foreground">
                Upgrade your subscription to unlock the storefront module, or ask the platform admin to enable it for
                your business.
              </p>
              <Button asChild variant="outline" className="mt-3">
                <a href="/billing">View plans</a>
              </Button>
            </div>
          </div>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="p-5 shadow-soft border-0 lg:col-span-2">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <div className="font-semibold">Store status</div>
                <p className="text-xs text-muted-foreground">When off, your store link shows “store not found”.</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={form.store_enabled ? "default" : "secondary"}>{form.store_enabled ? "Live" : "Off"}</Badge>
                <Switch
                  checked={form.store_enabled}
                  disabled={!canEdit}
                  onCheckedChange={(v) => setForm({ ...form, store_enabled: v })}
                />
              </div>
            </div>

            <div className="grid gap-3">
              <div>
                <Label>WhatsApp number for orders</Label>
                <Input
                  placeholder="e.g. +256700000000"
                  value={form.whatsapp_number}
                  disabled={!canEdit}
                  onChange={(e) => setForm({ ...form, whatsapp_number: e.target.value })}
                />
                <p className="mt-1 text-xs text-muted-foreground">Include the country code. Orders open in this chat.</p>
              </div>
              <div>
                <Label>Store headline</Label>
                <Input
                  placeholder={`Shop with ${tenant?.business_name ?? "us"}`}
                  value={form.store_headline}
                  disabled={!canEdit}
                  onChange={(e) => setForm({ ...form, store_headline: e.target.value })}
                />
              </div>
              <div>
                <Label>About / delivery info</Label>
                <Textarea
                  rows={3}
                  value={form.store_about}
                  disabled={!canEdit}
                  onChange={(e) => setForm({ ...form, store_about: e.target.value })}
                />
              </div>
              {canEdit && (
                <div>
                  <Button onClick={() => save.mutate()} disabled={save.isPending} className="gradient-emerald text-white">
                    {save.isPending ? "Saving…" : "Save store settings"}
                  </Button>
                </div>
              )}
            </div>
          </Card>

          <Card className="p-5 shadow-soft border-0">
            <div className="mb-2 flex items-center gap-2 font-semibold">
              <Store className="h-4 w-4" />Your store link
            </div>
            <div className="break-all rounded-lg border bg-muted/40 p-2 text-xs">{storeUrl}</div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => {
                  navigator.clipboard.writeText(storeUrl);
                  toast.success("Link copied");
                }}
              >
                <Copy className="h-3.5 w-3.5" />Copy
              </Button>
              <Button asChild variant="outline" size="sm" className="gap-1.5">
                <a href={storeUrl} target="_blank" rel="noreferrer"><ExternalLink className="h-3.5 w-3.5" />Open store</a>
              </Button>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Every checkout creates a quotation under Quotations, and the customer is saved under Customers.
            </p>
          </Card>
        </div>
      )}
    </>
  );
}

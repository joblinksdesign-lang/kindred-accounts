import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Save, Trash2, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { PageHeader } from "@/components/page-helpers";
import { usePaymentMethods, usePlatformSettings, type PaymentMethod } from "@/lib/platform-payment";

export const Route = createFileRoute("/_authenticated/admin/payment-methods")({
  head: () => ({
    meta: [
      { title: "Payment details — Softtrack Pos admin" },
      { name: "description", content: "Manage the mobile money and bank details businesses use to pay for their plans." },
    ],
  }),
  component: AdminPaymentMethods,
  errorComponent: ({ error }) => <div className="p-8 text-sm text-destructive">{error.message}</div>,
  notFoundComponent: () => <div className="p-8 text-sm">Not found</div>,
});

type Draft = Omit<PaymentMethod, "id"> & { id: string | null };

const emptyDraft = (sort: number): Draft => ({
  id: null,
  label: "",
  account_name: "",
  account_number: "",
  instructions: "",
  sort_order: sort,
  is_active: true,
});

function AdminPaymentMethods() {
  const qc = useQueryClient();
  const { data: methods = [] } = usePaymentMethods(true);
  const { data: settings } = usePlatformSettings();

  const [rows, setRows] = useState<Draft[]>([]);
  const [whatsapp, setWhatsapp] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    setRows(methods.map((m) => ({ ...m })));
  }, [methods]);

  useEffect(() => {
    setWhatsapp(settings?.admin_whatsapp ?? "");
    setNote(settings?.payment_note ?? "");
  }, [settings]);

  const patch = (i: number, p: Partial<Draft>) =>
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...p } : row)));

  const saveSettings = useMutation({
    mutationFn: async () => {
      if (!settings?.id) throw new Error("Settings row missing");
      const { error } = await supabase
        .from("platform_settings")
        .update({ admin_whatsapp: whatsapp || null, payment_note: note || null })
        .eq("id", settings.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Contact and payment note saved");
      qc.invalidateQueries({ queryKey: ["platform_settings"] });
    },
    onError: (e: Error) => toast.error("Could not save", { description: e.message }),
  });

  const saveRow = useMutation({
    mutationFn: async (row: Draft) => {
      if (!row.label.trim()) throw new Error("Give this payment method a name");
      const payload = {
        label: row.label.trim(),
        account_name: row.account_name || null,
        account_number: row.account_number || null,
        instructions: row.instructions || null,
        sort_order: Number(row.sort_order) || 0,
        is_active: row.is_active,
      };
      if (row.id) {
        const { error } = await supabase.from("platform_payment_methods").update(payload).eq("id", row.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("platform_payment_methods").insert(payload as never);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Payment method saved");
      qc.invalidateQueries({ queryKey: ["platform_payment_methods"] });
    },
    onError: (e: Error) => toast.error("Could not save", { description: e.message }),
  });

  const removeRow = useMutation({
    mutationFn: async (row: Draft) => {
      if (!row.id) return;
      const { error } = await supabase.from("platform_payment_methods").delete().eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Payment method removed");
      qc.invalidateQueries({ queryKey: ["platform_payment_methods"] });
    },
    onError: (e: Error) => toast.error("Could not remove", { description: e.message }),
  });

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Payment details"
        subtitle="Shown to businesses whose plan has expired or who are waiting for approval."
      />

      <Card className="p-5 space-y-4">
        <div className="text-sm font-semibold">Admin contact & note</div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Admin WhatsApp number</Label>
            <Input
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              placeholder="e.g. +256 700 000 000"
            />
            <p className="text-xs text-muted-foreground">Used by the “Notify admin” buttons.</p>
          </div>
          <div className="space-y-1.5">
            <Label>Payment note</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
          </div>
        </div>
        <Button onClick={() => saveSettings.mutate()} disabled={saveSettings.isPending} className="gradient-emerald text-white">
          <Save className="mr-1.5 h-4 w-4" /> Save
        </Button>
      </Card>

      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold">Payment methods</div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setRows((r) => [...r, emptyDraft(r.length)])}
        >
          <Plus className="mr-1.5 h-4 w-4" /> Add method
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {rows.map((row, i) => (
          <Card key={row.id ?? `new-${i}`} className="p-5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Wallet className="h-4 w-4 text-primary" />
                {row.label || "New payment method"}
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={row.is_active} onCheckedChange={(v) => patch(i, { is_active: v })} />
                <span className="text-xs text-muted-foreground">{row.is_active ? "Visible" : "Hidden"}</span>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input value={row.label} onChange={(e) => patch(i, { label: e.target.value })} placeholder="MTN Mobile Money" />
              </div>
              <div className="space-y-1.5">
                <Label>Account / phone number</Label>
                <Input value={row.account_number ?? ""} onChange={(e) => patch(i, { account_number: e.target.value })} placeholder="0770 000 000" />
              </div>
              <div className="space-y-1.5">
                <Label>Account name</Label>
                <Input value={row.account_name ?? ""} onChange={(e) => patch(i, { account_name: e.target.value })} placeholder="Growth Point Ltd" />
              </div>
              <div className="space-y-1.5">
                <Label>Order</Label>
                <Input
                  type="number"
                  value={row.sort_order}
                  onChange={(e) => patch(i, { sort_order: Number(e.target.value) })}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Extra note</Label>
              <Textarea
                rows={2}
                value={row.instructions ?? ""}
                onChange={(e) => patch(i, { instructions: e.target.value })}
                placeholder="Use your business name as the reference."
              />
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => saveRow.mutate(row)} disabled={saveRow.isPending} className="gradient-emerald text-white">
                <Save className="mr-1.5 h-4 w-4" /> Save
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive"
                onClick={() => (row.id ? removeRow.mutate(row) : setRows((r) => r.filter((_, idx) => idx !== i)))}
              >
                <Trash2 className="mr-1.5 h-4 w-4" /> Remove
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

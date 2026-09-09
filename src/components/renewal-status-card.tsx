import { useQuery } from "@tanstack/react-query";
import { Clock, MessageCircle, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useActiveTenant } from "@/lib/tenant";
import { usePaymentMethods, usePlatformSettings, whatsappLink } from "@/lib/platform-payment";

/**
 * Shown while a renewal / plan-change request is waiting for admin approval.
 * Repeats how to pay so the business can settle before activation.
 */
export function RenewalStatusCard() {
  const { tenantId, tenant } = useActiveTenant();
  const { data: methods = [] } = usePaymentMethods();
  const { data: settings } = usePlatformSettings();

  const { data: pending } = useQuery({
    queryKey: ["pending_plan_request", tenantId],
    enabled: !!tenantId,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscriptions")
        .select("id, pending_plan_id, pending_billing_cycle, pending_requested_at, plans:pending_plan_id(name)")
        .eq("tenant_id", tenantId!)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data?.pending_plan_id) return null;
      return data as unknown as {
        pending_billing_cycle: string | null;
        pending_requested_at: string | null;
        plans: { name: string } | null;
      };
    },
  });

  if (!pending) return null;

  const planName = pending.plans?.name ?? "your new plan";
  const msg =
    `Hello Admin, this is ${tenant?.business_name ?? "our business"}. ` +
    `We have requested ${planName} (${pending.pending_billing_cycle ?? "monthly"}) and made the payment. ` +
    `Please review and activate our plan. Thank you.`;
  const wa = whatsappLink(settings?.admin_whatsapp, msg);

  return (
    <Card className="overflow-hidden border-l-4 border-l-amber-500 bg-amber-500/5 p-0">
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-amber-500/15 text-amber-600">
          <Clock className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold">Your renewal request has been received</div>
          <p className="mt-1 text-sm text-muted-foreground">
            The admin is still reviewing it. Please make sure your payment has gone through — your
            plan is activated as soon as payment is confirmed.
          </p>

          {settings?.payment_note && (
            <p className="mt-3 text-xs text-muted-foreground">{settings.payment_note}</p>
          )}

          {methods.length > 0 && (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {methods.map((m) => (
                <div key={m.id} className="rounded-xl border bg-card p-3">
                  <div className="flex items-center gap-2 text-xs font-semibold">
                    <Wallet className="h-3.5 w-3.5 text-primary" />
                    {m.label}
                  </div>
                  {m.account_number && (
                    <div className="mt-1 font-mono text-sm font-bold tracking-wide">{m.account_number}</div>
                  )}
                  {m.account_name && (
                    <div className="text-xs text-muted-foreground">{m.account_name}</div>
                  )}
                  {m.instructions && (
                    <div className="mt-1 text-[11px] text-muted-foreground">{m.instructions}</div>
                  )}
                </div>
              ))}
            </div>
          )}

          {wa && (
            <Button asChild size="sm" className="mt-4 bg-[#25D366] text-white hover:bg-[#1fb457]">
              <a href={wa} target="_blank" rel="noreferrer">
                <MessageCircle className="mr-1.5 h-4 w-4" />
                Notify admin on WhatsApp
              </a>
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

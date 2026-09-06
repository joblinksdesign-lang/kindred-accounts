import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sendTemplateEmail } from "@/lib/email-templates/send-email";

const APP_URL = "https://softtrack.online";

const money = (symbol: string, amount: number) =>
  `${symbol.trim()} ${Number(amount || 0).toLocaleString("en-UG", { maximumFractionDigits: 0 })}`;

const METHOD_LABELS: Record<string, string> = {
  cash: "Cash",
  bank_transfer: "Bank transfer",
  mobile_money: "Mobile money",
  credit_card: "Card",
  cheque: "Cheque",
};

/** Emails the business owner a confirmation when a payment is recorded. */
export const sendPaymentReceiptEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ paymentId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: payment, error } = await supabase
      .from("payments")
      .select(
        "id, amount, method, payment_date, tenant_id, invoices(invoice_number, total, balance, customers(name)), tenants(business_name, email, currency_symbol)",
      )
      .eq("id", data.paymentId)
      .maybeSingle();
    if (error) throw error;
    if (!payment) return { sent: false as const, reason: "not_found" };

    const tenant = payment.tenants as unknown as
      | { business_name: string; email: string; currency_symbol: string | null }
      | null;
    if (!tenant?.email) return { sent: false as const, reason: "no_recipient" };

    const invoice = payment.invoices as unknown as
      | { invoice_number: string; total: number; balance: number; customers: { name: string } | null }
      | null;
    const sym = tenant.currency_symbol || "USh";

    try {
      const result = await sendTemplateEmail("payment-receipt", tenant.email, {
        idempotencyKey: `payment-receipt-${payment.id}`,
        templateData: {
          businessName: tenant.business_name,
          customerName: invoice?.customers?.name ?? undefined,
          invoiceNumber: invoice?.invoice_number ?? undefined,
          amount: money(sym, Number(payment.amount)),
          method: METHOD_LABELS[payment.method as string] ?? String(payment.method),
          paymentDate: payment.payment_date,
          invoiceTotal: invoice ? money(sym, Number(invoice.total)) : undefined,
          balance: invoice ? money(sym, Number(invoice.balance)) : undefined,
        },
      });
      return result.sent ? { sent: true as const } : { sent: false as const, reason: result.reason };
    } catch (e) {
      console.error("payment receipt email failed", (e as Error).message);
      return { sent: false as const, reason: "send_failed" };
    }
  });

/** Emails a business owner that their registration has been approved. Super-admin only. */
export const sendBusinessApprovedEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ tenantId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: roles, error: rolesError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    if (rolesError) throw rolesError;
    if (!(roles ?? []).some((r) => r.role === "super_admin")) throw new Error("Forbidden");

    const { data: tenant, error } = await supabase
      .from("tenants")
      .select("id, business_name, email, plans(name)")
      .eq("id", data.tenantId)
      .maybeSingle();
    if (error) throw error;
    if (!tenant?.email) return { sent: false as const, reason: "no_recipient" };

    const plan = tenant.plans as unknown as { name: string } | null;

    try {
      const result = await sendTemplateEmail("business-approved", tenant.email, {
        idempotencyKey: `business-approved-${tenant.id}`,
        templateData: {
          businessName: tenant.business_name,
          planName: plan?.name,
          appUrl: `${APP_URL}/dashboard`,
        },
      });
      return result.sent ? { sent: true as const } : { sent: false as const, reason: result.reason };
    } catch (e) {
      console.error("business approved email failed", (e as Error).message);
      return { sent: false as const, reason: "send_failed" };
    }
  });

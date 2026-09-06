import { createFileRoute } from "@tanstack/react-router";
import { sendTemplateEmail } from "@/lib/email-templates/send-email";

const APP_URL = "https://softtrack.online";
// Reminder windows, in days before the plan ends.
const REMIND_DAYS = [7, 3, 1, 0];

async function run(request: Request) {
  const secret = process.env["CRON_SECRET"];
  if (!secret) return Response.json({ error: "Not configured" }, { status: 500 });

  const auth = request.headers.get("Authorization");
  const provided = auth?.startsWith("Bearer ") ? auth.slice(7) : new URL(request.url).searchParams.get("key");
  if (provided !== secret) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const now = new Date();
  const horizon = new Date(now.getTime() + 8 * 24 * 60 * 60 * 1000);

  const { data: subs, error } = await supabaseAdmin
    .from("subscriptions")
    .select("id, current_period_end, status, tenants(business_name, email, status), plans(name)")
    .in("status", ["active", "trialing", "past_due"])
    .not("current_period_end", "is", null)
    .lte("current_period_end", horizon.toISOString())
    .gte("current_period_end", new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString());

  if (error) return Response.json({ error: error.message }, { status: 500 });

  let sent = 0;
  let skipped = 0;

  for (const sub of subs ?? []) {
    const tenant = sub.tenants as unknown as
      | { business_name: string; email: string; status: string }
      | null;
    if (!tenant?.email || tenant.status !== "active") {
      skipped++;
      continue;
    }

    const end = new Date(sub.current_period_end as string);
    const daysLeft = Math.ceil((end.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
    if (!REMIND_DAYS.includes(Math.max(daysLeft, 0)) || daysLeft > 7) {
      skipped++;
      continue;
    }

    const plan = sub.plans as unknown as { name: string } | null;
    const dayKey = end.toISOString().slice(0, 10);

    try {
      const result = await sendTemplateEmail("plan-expiry-reminder", tenant.email, {
        // One reminder per subscription, per period end, per window.
        idempotencyKey: `plan-expiry-${sub.id}-${dayKey}-${Math.max(daysLeft, 0)}`,
        templateData: {
          businessName: tenant.business_name,
          planName: plan?.name,
          expiryDate: end.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }),
          daysLeft: Math.max(daysLeft, 0),
          expired: daysLeft <= 0,
          billingUrl: `${APP_URL}/billing`,
        },
      });
      if (result.sent) sent++;
      else skipped++;
    } catch (e) {
      console.error("plan expiry reminder failed", (e as Error).message);
      skipped++;
    }
  }

  return Response.json({ checked: (subs ?? []).length, sent, skipped });
}

export const Route = createFileRoute("/api/public/plan-expiry-reminders")({
  server: {
    handlers: {
      GET: ({ request }) => run(request),
      POST: ({ request }) => run(request),
    },
  },
});

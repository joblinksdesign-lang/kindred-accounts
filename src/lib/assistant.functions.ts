import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createLovableAiGatewayRunIdFetch } from "@/lib/ai-gateway.server";

const AskInput = z.object({
  tenantId: z.string().uuid(),
  branchId: z.string().uuid().nullable().optional(),
  question: z.string().min(2).max(500),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) }))
    .max(10)
    .optional(),
});

const money = (n: number) => `USh ${Math.round(n).toLocaleString("en-UG")}`;
const dayStart = (daysAgo: number) => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
};

/**
 * Answers plain-language questions about a branch's stock and sales.
 * All figures are read with the caller's own permissions (RLS) and summarised
 * server-side, so the model only ever sees aggregated business data.
 */
export const askBusinessAssistant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => AskInput.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: membership, error: membershipError } = await supabase
      .from("tenant_users")
      .select("role, branch_id")
      .eq("tenant_id", data.tenantId)
      .eq("user_id", userId)
      .eq("is_active", true)
      .maybeSingle();
    if (membershipError) throw membershipError;
    if (!membership) throw new Error("Unauthorized");

    // Staff tied to a branch can only ask about their own branch.
    const branchId = membership.branch_id ?? data.branchId ?? null;

    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("The AI assistant is not configured yet.");

    const [tenantRes, branchRes, productsRes, stockRes, invoicesRes, expensesRes] = await Promise.all([
      supabase.from("tenants").select("name").eq("id", data.tenantId).maybeSingle(),
      branchId
        ? supabase.from("branches").select("name").eq("id", branchId).maybeSingle()
        : Promise.resolve({ data: null as { name: string } | null }),
      supabase
        .from("products")
        .select("id, name, sku, category, quantity, reorder_level, unit_price, cost_price, is_active")
        .eq("tenant_id", data.tenantId)
        .eq("is_active", true)
        .limit(500),
      branchId
        ? supabase.from("branch_stock").select("product_id, quantity").eq("branch_id", branchId).limit(1000)
        : Promise.resolve({ data: [] as { product_id: string; quantity: number }[] }),
      supabase
        .from("invoices")
        .select("id, invoice_date, status, total, amount_paid, balance, branch_id")
        .eq("tenant_id", data.tenantId)
        .gte("invoice_date", dayStart(60).slice(0, 10))
        .limit(1000),
      supabase
        .from("expenses")
        .select("amount, category, expense_date, branch_id")
        .eq("tenant_id", data.tenantId)
        .gte("expense_date", dayStart(60).slice(0, 10))
        .limit(1000),
    ]);

    const products = productsRes.data ?? [];
    const stockMap = new Map((stockRes.data ?? []).map((s) => [s.product_id, s.quantity]));
    const qtyOf = (p: { id: string; quantity: number }) =>
      branchId ? (stockMap.get(p.id) ?? 0) : p.quantity;

    const invoices = (invoicesRes.data ?? []).filter(
      (i) =>
        i.status !== "draft" &&
        i.status !== "cancelled" &&
        (!branchId || i.branch_id === branchId),
    );
    const expenses = (expensesRes.data ?? []).filter((e) => !branchId || e.branch_id === branchId);

    const since = (days: number) => dayStart(days).slice(0, 10);
    const sumSales = (days: number) =>
      invoices.filter((i) => i.invoice_date >= since(days)).reduce((s, i) => s + Number(i.total), 0);
    const countSales = (days: number) => invoices.filter((i) => i.invoice_date >= since(days)).length;

    // Best sellers over the last 30 days, from line items of those invoices.
    const recentIds = invoices.filter((i) => i.invoice_date >= since(30)).map((i) => i.id);
    let topLines = "No sales recorded in the last 30 days.";
    if (recentIds.length) {
      const { data: items } = await supabase
        .from("invoice_items")
        .select("description, quantity, line_total, invoice_id")
        .in("invoice_id", recentIds.slice(0, 300));
      const agg = new Map<string, { qty: number; value: number }>();
      for (const it of items ?? []) {
        const cur = agg.get(it.description) ?? { qty: 0, value: 0 };
        cur.qty += Number(it.quantity);
        cur.value += Number(it.line_total);
        agg.set(it.description, cur);
      }
      topLines =
        [...agg.entries()]
          .sort((a, b) => b[1].value - a[1].value)
          .slice(0, 15)
          .map(([name, v]) => `- ${name}: ${v.qty} sold, ${money(v.value)}`)
          .join("\n") || topLines;
    }

    const lowStock = products
      .filter((p) => qtyOf(p) <= (p.reorder_level ?? 0))
      .slice(0, 30)
      .map((p) => `- ${p.name}${p.sku ? ` (${p.sku})` : ""}: ${qtyOf(p)} left, reorder at ${p.reorder_level}`);

    const stockValue = products.reduce((s, p) => s + qtyOf(p) * Number(p.cost_price ?? 0), 0);
    const unpaid = invoices.reduce((s, i) => s + Number(i.balance), 0);
    const expense30 = expenses
      .filter((e) => e.expense_date >= since(30))
      .reduce((s, e) => s + Number(e.amount), 0);

    const topStock = [...products]
      .sort((a, b) => qtyOf(b) - qtyOf(a))
      .slice(0, 25)
      .map((p) => `- ${p.name}: ${qtyOf(p)} in stock, sells at ${money(Number(p.unit_price))}`);

    const businessContext = `Business: ${tenantRes.data?.name ?? "This business"}
Scope: ${branchRes.data?.name ? `${branchRes.data.name} branch only` : "all branches"}
Today: ${new Date().toISOString().slice(0, 10)}
Currency: Ugandan Shillings, written as "USh 12,000".

SALES
- Today: ${money(sumSales(0))} from ${countSales(0)} sale(s)
- Last 7 days: ${money(sumSales(7))} from ${countSales(7)} sale(s)
- Last 30 days: ${money(sumSales(30))} from ${countSales(30)} sale(s)
- Previous 30 days before that: ${money(sumSales(60) - sumSales(30))}
- Unpaid balance outstanding: ${money(unpaid)}

EXPENSES
- Last 30 days: ${money(expense30)}

STOCK (${products.length} active products, stock value ${money(stockValue)})
Low or out of stock:
${lowStock.length ? lowStock.join("\n") : "- Nothing is below its reorder level."}

Largest stock holdings:
${topStock.join("\n") || "- No products yet."}

BEST SELLERS (last 30 days, by value)
${topLines}`;

    const runIdFetch = createLovableAiGatewayRunIdFetch();
    const lovable = createOpenAI({
      baseURL: "https://ai.gateway.lovable.dev/v1",
      apiKey,
      headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
      fetch: runIdFetch.fetch,
    });

    const result = streamText({
      model: lovable.responses("openai/gpt-6-astra"),
      system: `You are the shop assistant inside Softtrack Pos, helping counter and branch staff in Uganda.
Answer only from the DATA below. If the data does not cover the question, say so plainly and suggest what to check in the app.
Be short and practical: 2-6 sentences or a tight bullet list, always ending with one concrete action to take.
Write money as USh with thousands separators. Never invent numbers, product names or customers. Plain language, no jargon.

DATA
${businessContext}`,
      messages: [
        ...(data.history ?? []).map((m) => ({ role: m.role, content: m.content }) as const),
        { role: "user" as const, content: data.question },
      ],
      providerOptions: {
        openai: {
          forceReasoning: true,
          reasoningEffort: "low",
          store: false,
        },
      },
    });

    return { answer: await result.text };
  });

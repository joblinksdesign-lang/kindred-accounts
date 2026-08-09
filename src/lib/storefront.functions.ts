import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

async function publicClient() {
  const { createClient } = await import("@supabase/supabase-js");
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  return createClient(process.env["SUPABASE_URL"]!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input: RequestInfo | URL, init?: RequestInit) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
        h.set("apikey", key);
        return fetch(input as never, { ...init, headers: h });
      },
    },
  });
}

export type StorefrontProduct = {
  id: string;
  name: string;
  sku: string | null;
  category: string | null;
  description: string | null;
  unit_price: number;
  image_url: string | null;
  quantity: number;
};

export type StorefrontData = {
  tenant: { id: string; slug: string; business_name: string; currency: string; currency_symbol: string };
  company: {
    company_name: string;
    tagline: string | null;
    brand_color: string | null;
    logo_url: string | null;
    email: string | null;
    phone: string | null;
    website: string | null;
    address: string | null;
    city: string | null;
    country: string | null;
    currency_symbol: string;
    default_tax_rate: number;
    whatsapp_number: string | null;
    store_headline: string | null;
    store_about: string | null;
  };
  products: StorefrontProduct[];
};

/** Public: everything the storefront page needs for one business. */
export const getStorefront = createServerFn({ method: "GET" })
  .inputValidator((data) => z.object({ slug: z.string().min(1).max(120) }).parse(data))
  .handler(async ({ data }): Promise<StorefrontData | null> => {
    const sb = await publicClient();

    const { data: tenant } = await sb
      .from("tenants")
      .select("id, slug, business_name, currency, currency_symbol")
      .eq("slug", data.slug)
      .maybeSingle();
    if (!tenant) return null;

    const [{ data: company }, { data: products }] = await Promise.all([
      sb
        .from("company_settings")
        .select(
          "company_name, tagline, brand_color, logo_path, logo_url, email, phone, website, address, city, country, currency_symbol, default_tax_rate, whatsapp_number, store_headline, store_about, store_enabled",
        )
        .eq("tenant_id", tenant.id)
        .maybeSingle(),
      sb
        .from("products")
        .select("id, name, sku, category, description, unit_price, image_url, quantity")
        .eq("tenant_id", tenant.id)
        .eq("is_active", true)
        .order("name"),
    ]);
    if (!company) return null;

    let logoUrl: string | null = company.logo_url ?? null;
    if (company.logo_path) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: signed } = await supabaseAdmin.storage
        .from("company-assets")
        .createSignedUrl(company.logo_path, 60 * 60);
      if (signed?.signedUrl) logoUrl = signed.signedUrl;
    }

    return {
      tenant: tenant as StorefrontData["tenant"],
      company: {
        company_name: company.company_name,
        tagline: company.tagline,
        brand_color: company.brand_color,
        logo_url: logoUrl,
        email: company.email,
        phone: company.phone,
        website: company.website,
        address: company.address,
        city: company.city,
        country: company.country,
        currency_symbol: company.currency_symbol,
        default_tax_rate: Number(company.default_tax_rate ?? 0),
        whatsapp_number: company.whatsapp_number,
        store_headline: company.store_headline,
        store_about: company.store_about,
      },
      products: (products ?? []).map((p) => ({ ...p, unit_price: Number(p.unit_price) })) as StorefrontProduct[],
    };
  });

const checkoutSchema = z.object({
  slug: z.string().min(1).max(120),
  customer: z.object({
    name: z.string().trim().min(1).max(120),
    phone: z.string().trim().min(3).max(40),
    email: z.string().trim().email().max(160).optional().or(z.literal("")),
    address: z.string().trim().max(300).optional().or(z.literal("")),
    notes: z.string().trim().max(600).optional().or(z.literal("")),
  }),
  items: z
    .array(z.object({ product_id: z.string().uuid(), quantity: z.number().int().min(1).max(9999) }))
    .min(1)
    .max(60),
});

export type StoreOrderResult = {
  quoteNumber: string;
  quotationId: string;
  date: string;
  items: { description: string; quantity: number; unit_price: number; line_total: number }[];
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  whatsappNumber: string | null;
};

/** Public: turns a storefront cart into a quotation for the business. */
export const submitStoreOrder = createServerFn({ method: "POST" })
  .inputValidator((data) => checkoutSchema.parse(data))
  .handler(async ({ data }): Promise<StoreOrderResult> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: tenant } = await supabaseAdmin
      .from("tenants")
      .select("id, business_name, status")
      .eq("slug", data.slug)
      .maybeSingle();
    if (!tenant || tenant.status !== "active") throw new Error("This store is not available.");

    const { data: company } = await supabaseAdmin
      .from("company_settings")
      .select("store_enabled, default_tax_rate, whatsapp_number, phone")
      .eq("tenant_id", tenant.id)
      .maybeSingle();
    if (!company?.store_enabled) throw new Error("This store is not accepting orders.");

    const ids = data.items.map((i) => i.product_id);
    const { data: products } = await supabaseAdmin
      .from("products")
      .select("id, name, unit_price, is_active")
      .eq("tenant_id", tenant.id)
      .in("id", ids);

    const priced = data.items.map((i) => {
      const p = (products ?? []).find((x) => x.id === i.product_id && x.is_active);
      if (!p) throw new Error("One of the items is no longer available.");
      const unit = Number(p.unit_price);
      return {
        product_id: p.id,
        description: p.name,
        quantity: i.quantity,
        unit_price: unit,
        line_total: Number((unit * i.quantity).toFixed(2)),
      };
    });

    const subtotal = Number(priced.reduce((s, i) => s + i.line_total, 0).toFixed(2));
    const taxRate = Number(company.default_tax_rate ?? 0);
    const taxAmount = Number(((subtotal * taxRate) / 100).toFixed(2));
    const total = Number((subtotal + taxAmount).toFixed(2));

    // Reuse an existing customer record when the phone or email matches.
    const email = data.customer.email || null;
    let customerId: string | null = null;
    const { data: existing } = await supabaseAdmin
      .from("customers")
      .select("id, phone, email")
      .eq("tenant_id", tenant.id)
      .or(`phone.eq.${data.customer.phone}${email ? `,email.eq.${email}` : ""}`)
      .limit(1);
    if (existing && existing.length > 0) {
      customerId = existing[0].id;
      await supabaseAdmin
        .from("customers")
        .update({ name: data.customer.name, address: data.customer.address || null })
        .eq("id", customerId);
    } else {
      const { data: created, error: custErr } = await supabaseAdmin
        .from("customers")
        .insert({
          tenant_id: tenant.id,
          name: data.customer.name,
          phone: data.customer.phone,
          email,
          address: data.customer.address || null,
          notes: "Created from online store",
        })
        .select("id")
        .single();
      if (custErr) throw custErr;
      customerId = created.id;
    }

    const today = new Date().toISOString().slice(0, 10);
    const { data: quote, error: qErr } = await supabaseAdmin
      .from("quotations")
      .insert({
        tenant_id: tenant.id,
        customer_id: customerId,
        quote_number: "",
        quote_date: today,
        status: "sent",
        subtotal,
        tax_rate: taxRate,
        tax_amount: taxAmount,
        discount: 0,
        total,
        notes: ["Online store order", data.customer.notes].filter(Boolean).join(" — ") || null,
      })
      .select("id, quote_number, quote_date")
      .single();
    if (qErr) throw qErr;

    const { error: itemsErr } = await supabaseAdmin.from("quotation_items").insert(
      priced.map((i) => ({
        tenant_id: tenant.id,
        quotation_id: quote.id,
        product_id: i.product_id,
        description: i.description,
        quantity: i.quantity,
        unit_price: i.unit_price,
        line_total: i.line_total,
      })),
    );
    if (itemsErr) throw itemsErr;

    await supabaseAdmin.rpc("notify_tenant_admins", {
      _tenant: tenant.id,
      _type: `store_order:${quote.id}`,
      _title: "New online store order",
      _message: `${data.customer.name} placed an order (${quote.quote_number}).`,
      _link: `/quotations?quotation=${quote.id}`,
    });

    return {
      quoteNumber: quote.quote_number,
      quotationId: quote.id,
      date: quote.quote_date,
      items: priced.map(({ description, quantity, unit_price, line_total }) => ({
        description,
        quantity,
        unit_price,
        line_total,
      })),
      subtotal,
      taxRate,
      taxAmount,
      total,
      whatsappNumber: company.whatsapp_number || company.phone || null,
    };
  });

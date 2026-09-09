import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";


export type StorefrontProduct = {
  id: string;
  name: string;
  sku: string | null;
  category: string | null;
  description: string | null;
  unit_price: number;
  image_url: string | null;
  images: string[];
  quantity: number;
  reorder_level: number;
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
    // Storefront reads run server-side with an explicit store check so no
    // internal tenant/product columns are ever readable by anonymous clients.
    const { supabaseAdmin: sb } = await import("@/integrations/supabase/client.server");

    const { data: tenant } = await sb
      .from("tenants")
      .select("id, slug, business_name, currency, currency_symbol, status")
      .eq("slug", data.slug)
      .maybeSingle();
    if (!tenant || tenant.status !== "active") return null;

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
        .select("id, name, sku, category, description, unit_price, image_url, image_paths, quantity, reorder_level")
        .eq("tenant_id", tenant.id)
        .eq("is_active", true)
        .order("name"),
    ]);
    if (!company?.store_enabled) return null;



    let logoUrl: string | null = company.logo_url ?? null;
    const admin = (await import("@/integrations/supabase/client.server")).supabaseAdmin;
    if (company.logo_path) {
      const { data: signed } = await admin.storage
        .from("company-assets")
        .createSignedUrl(company.logo_path, 60 * 60);
      if (signed?.signedUrl) logoUrl = signed.signedUrl;
    }

    // Sign every product image so the gallery can render private bucket files.
    const allPaths = (products ?? []).flatMap((p) => (p.image_paths ?? []) as string[]);
    const signedMap: Record<string, string> = {};
    if (allPaths.length > 0) {
      const { data: signedList } = await admin.storage
        .from("product-images")
        .createSignedUrls(allPaths, 60 * 60);
      (signedList ?? []).forEach((s) => {
        if (s.path && s.signedUrl) signedMap[s.path] = s.signedUrl;
      });
    }

    return {

      tenant: {
        id: tenant.id,
        slug: tenant.slug,
        business_name: tenant.business_name,
        currency: tenant.currency,
        currency_symbol: tenant.currency_symbol,
      },

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
      products: (products ?? []).map((p) => ({
        id: p.id,
        name: p.name,
        sku: p.sku,
        category: p.category,
        description: p.description,
        unit_price: Number(p.unit_price),
        image_url: p.image_url,
        images: (((p.image_paths ?? []) as string[]).map((path) => signedMap[path]).filter(Boolean) as string[]).concat(
          p.image_url && ((p.image_paths ?? []) as string[]).length === 0 ? [p.image_url] : [],
        ),
        quantity: Number(p.quantity ?? 0),
        reorder_level: Number(p.reorder_level ?? 0),
      })) as StorefrontProduct[],

    };
  });

const checkoutSchema = z.object({
  slug: z.string().min(1).max(120),
  walkIn: z.boolean().optional(),
  code: z.string().trim().min(3).max(16).optional().or(z.literal("")),
  customer: z
    .object({
      name: z.string().trim().min(1).max(120),
      phone: z.string().trim().min(3).max(40),
      email: z.string().trim().email().max(160).optional().or(z.literal("")),
      address: z.string().trim().max(300).optional().or(z.literal("")),
      notes: z.string().trim().max(600).optional().or(z.literal("")),
    })
    .optional(),
  notes: z.string().trim().max(600).optional().or(z.literal("")),
  items: z
    .array(z.object({ product_id: z.string().uuid(), quantity: z.number().int().min(1).max(9999) }))
    .min(1)
    .max(60),
});

export type StoreCustomerLookup = {
  found: boolean;
  code?: string;
  name?: string;
  phone?: string;
  email?: string;
  address?: string;
};

/** Public: checks a shopper's 5-character shop code for one business. */
export const lookupStoreCustomer = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z.object({ slug: z.string().min(1).max(120), code: z.string().trim().min(3).max(16) }).parse(data),
  )
  .handler(async ({ data }): Promise<StoreCustomerLookup> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: tenant } = await supabaseAdmin
      .from("tenants")
      .select("id, status")
      .eq("slug", data.slug)
      .maybeSingle();
    if (!tenant || tenant.status !== "active") return { found: false };

    const { data: customer } = await supabaseAdmin
      .from("customers")
      .select("store_code, name, phone, email, address")
      .eq("tenant_id", tenant.id)
      .ilike("store_code", data.code)
      .maybeSingle();
    if (!customer) return { found: false };

    return {
      found: true,
      code: customer.store_code ?? data.code,
      name: customer.name,
      phone: customer.phone ?? "",
      email: customer.email ?? "",
      address: customer.address ?? "",
    };
  });

export type StoreOrderResult = {
  quoteNumber: string;
  quotationId: string;
  date: string;
  customerCode: string | null;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
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
      .select("id, name, unit_price, is_active, quantity")
      .eq("tenant_id", tenant.id)
      .in("id", ids);

    const priced = data.items.map((i) => {
      const p = (products ?? []).find((x) => x.id === i.product_id && x.is_active);
      if (!p) throw new Error("One of the items is no longer available.");
      const stock = Number(p.quantity ?? 0);
      if (stock <= 0) throw new Error(`${p.name} is out of stock.`);
      if (i.quantity > stock) throw new Error(`Only ${stock} of ${p.name} left in stock.`);

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

    // Returning shoppers are identified by their shop code; new ones fill the form.
    let customerId: string | null = null;
    let record: { id: string; name: string; phone: string | null; address: string | null; store_code: string | null } | null =
      null;

    if (data.walkIn) {
      // Shoppers buying at the counter share one "Walk-in customer" record per business.
      const { data: existingWalkIn } = await supabaseAdmin
        .from("customers")
        .select("id, name, phone, address, store_code")
        .eq("tenant_id", tenant.id)
        .eq("name", "Walk-in customer")
        .limit(1);
      if (existingWalkIn && existingWalkIn.length > 0) {
        record = existingWalkIn[0];
        customerId = existingWalkIn[0].id;
      } else {
        const { data: created, error: walkErr } = await supabaseAdmin
          .from("customers")
          .insert({
            tenant_id: tenant.id,
            name: "Walk-in customer",
            notes: "Shared walk-in customer for online store orders",
          })
          .select("id, name, phone, address, store_code")
          .single();
        if (walkErr) throw walkErr;
        record = created;
        customerId = created.id;
      }
    } else if (data.code) {
      const { data: byCode } = await supabaseAdmin
        .from("customers")
        .select("id, name, phone, address, store_code")
        .eq("tenant_id", tenant.id)
        .ilike("store_code", data.code)
        .maybeSingle();
      if (!byCode) throw new Error("We couldn't find that shop code. Please check it or order as a new customer.");
      record = byCode;
      customerId = byCode.id;
    } else {
      const form = data.customer;
      if (!form) throw new Error("Please enter your details or your shop code.");
      const email = form.email || null;
      const { data: existing } = await supabaseAdmin
        .from("customers")
        .select("id, name, phone, address, store_code")
        .eq("tenant_id", tenant.id)
        .or(`phone.eq.${form.phone}${email ? `,email.eq.${email}` : ""}`)
        .limit(1);
      if (existing && existing.length > 0) {
        record = existing[0];
        customerId = existing[0].id;
        await supabaseAdmin
          .from("customers")
          .update({ name: form.name, address: form.address || null })
          .eq("id", customerId);
        record = { ...existing[0], name: form.name, address: form.address || null };
      } else {
        const { data: created, error: custErr } = await supabaseAdmin
          .from("customers")
          .insert({
            tenant_id: tenant.id,
            name: form.name,
            phone: form.phone,
            email,
            address: form.address || null,
            notes: "Created from online store",
          })
          .select("id, name, phone, address, store_code")
          .single();
        if (custErr) throw custErr;
        record = created;
        customerId = created.id;
      }
    }

    const orderNotes = data.notes || data.customer?.notes || "";

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
        notes: ["Online store order", orderNotes].filter(Boolean).join(" — ") || null,
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
      _message: `${record?.name ?? "A customer"} placed an order (${quote.quote_number}).`,
      _link: `/quotations?quotation=${quote.id}`,
    });

    return {
      quoteNumber: quote.quote_number,
      quotationId: quote.id,
      date: quote.quote_date,
      customerCode: record?.store_code ?? null,
      customerName: record?.name ?? "",
      customerPhone: record?.phone ?? "",
      customerAddress: record?.address ?? "",
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


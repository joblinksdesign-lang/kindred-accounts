/**
 * Per-product discounts.
 *
 * A shop owner can put any product on offer, either as a percentage off or a
 * fixed amount off each unit. Everything else in the system (POS, online store,
 * quotations, invoices and receipts) prices from these helpers so the saving is
 * always shown and subtracted the same way.
 */

export type DiscountType = "none" | "percent" | "amount";

export type DiscountableProduct = {
  unit_price: number | string;
  discount_type?: string | null;
  discount_value?: number | string | null;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Money saved on one unit of this product. */
export function unitDiscount(p: DiscountableProduct): number {
  const price = Number(p.unit_price ?? 0);
  const value = Number(p.discount_value ?? 0);
  const type = (p.discount_type ?? "none") as DiscountType;
  if (!value || value <= 0 || type === "none") return 0;
  const off = type === "percent" ? (price * Math.min(value, 100)) / 100 : value;
  return round2(Math.max(0, Math.min(off, price)));
}

/** Price one unit actually sells for after the discount. */
export function netUnitPrice(p: DiscountableProduct): number {
  return round2(Math.max(0, Number(p.unit_price ?? 0) - unitDiscount(p)));
}

export function hasDiscount(p: DiscountableProduct): boolean {
  return unitDiscount(p) > 0;
}

/** Short badge text, e.g. "10% off" or "Save 2,000". */
export function discountBadge(p: DiscountableProduct, symbol = ""): string | null {
  const off = unitDiscount(p);
  if (off <= 0) return null;
  if ((p.discount_type ?? "none") === "percent") return `${Number(p.discount_value)}% off`;
  return `Save ${symbol}${Number(off).toLocaleString()}`;
}

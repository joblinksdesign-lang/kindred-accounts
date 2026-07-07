type NotificationLinkLike = {
  type: string;
  link?: string | null;
  tenant_id?: string | null;
};

const encode = (value: string) => encodeURIComponent(value);

export function getNotificationHref(notification: NotificationLinkLike) {
  const [kind, id] = notification.type.split(":");

  if (id) {
    if (kind === "overdue") return `/invoices/${encode(id)}`;
    if (kind === "low_stock") return `/products?product=${encode(id)}`;
    if (kind === "subscription_expiring" || kind === "subscription_expired" || kind === "plan_activated") {
      return `/billing?subscription=${encode(id)}`;
    }
    if (kind === "plan_request") return `/admin/tenants?subscription=${encode(id)}`;
    if (kind === "business_registered") return `/admin/tenants?tenant=${encode(id)}`;
    if (kind === "customer" || kind === "customer_created" || kind === "customer_updated") {
      return `/customers?customer=${encode(id)}`;
    }
  }

  if (kind === "business_registered" && notification.tenant_id) {
    return `/admin/tenants?tenant=${encode(notification.tenant_id)}`;
  }

  return notification.link || "/notifications";
}
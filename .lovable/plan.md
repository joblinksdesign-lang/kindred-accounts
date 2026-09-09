# Renewal flow, centred popups, and admin payment details

## 1. Centre the "add to home screen" popup on mobile
The shop install popup currently sits at the bottom edge on phones. It becomes a centred card with a soft dark backdrop on mobile, and keeps its small bottom-right position on desktop. Same buttons and dismiss-for-a-week behaviour.

## 2. Plan-blocked message becomes a centred dialog
Today, when an expired or over-limit business tries to sell or create an invoice, they get a small toast. Instead they see a centred dialog with:
- A clear headline (plan expired, or limit reached) and a plain-language explanation.
- A **Renew plan** button that opens the plans page.
- A "Not now" close button.

Used on: POS sale, new invoice, edit invoice save, new customer, new product, new team member.

## 3. Plans page renewal behaviour
On the plans page, when the business plan is expired:
- The plan they are on shows **Renew plan** instead of the greyed-out "Current plan".
- Tapping it sends the renewal request to the admin, shows "Request sent to admin", and the button changes to **Notify admin**.
- **Notify admin** opens WhatsApp to the platform admin number with a ready-written message: business name, plan, cycle, amount and that a renewal was requested.

## 4. "Request received" card with payment details
A card appears on both the dashboard and the plans page whenever a renewal/plan request is pending:
- "Your renewal request has been received and is under review by the admin."
- Reminder to make sure payment has been made, and how: the payment methods the admin has published (e.g. Mobile Money — name and number, Bank — account name and number).
- A **Notify admin on WhatsApp** button.

## 5. Admin: payment methods section
New admin page **Payments & details** (`/admin/payment-methods`) where the super admin can:
- Add, edit, reorder, enable/disable payment methods: label (e.g. MTN Mobile Money), account name, account number/details, extra note.
- Set the admin WhatsApp number used by the "Notify admin" buttons and a short payment instruction note.

These are shown to any business with an expired plan or a pending request.

## Technical notes
- New table `public.platform_payment_methods` (label, account_name, account_number, instructions, sort_order, is_active) with GRANTs; SELECT for `authenticated`, full write only for super admins via `is_super_admin(auth.uid())`.
- New singleton table `public.platform_settings` (admin_whatsapp, payment_note) with the same policy shape.
- New shared components: `PlanBlockDialog` (centred plan-block modal) and `RenewalStatusCard` (pending request + payment details), plus a `usePlatformPayment()` hook.
- `planBlockReason` stays as-is; call sites switch from `throw new Error(...)` toasts to opening the dialog with the reason.
- Install popup: mobile styles become `fixed inset-0 grid place-items-center` with a backdrop, `sm:` styles unchanged.

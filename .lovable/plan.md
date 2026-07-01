
## 1. Custom date range picker on dashboard

In `src/routes/_authenticated/dashboard.tsx`:

- Extend the `Period` type to `"day" | "week" | "month" | "custom"`.
- Add state `range: { from?: Date; to?: Date }`.
- Add a 4th `ToggleGroupItem` "Custom" next to Day/Week/Month. When active, show a `Popover` with the shadcn `Calendar` in `mode="range"` (uses `date-fns` + `react-day-picker`, already in the project via shadcn) — trigger is a Button with `CalendarIcon` showing `from – to` labels.
- Include `range.from` and `range.to` in the react-query `queryKey` so stats refetch on change.
- In the queryFn, when `period === "custom"`, compute `startISO`/`endISO` from the range and filter `pays` by `payment_date` and `invs` by `invoice_date` within `[from, to]`.
- Trend series for custom: bucket by day when the span ≤ 31 days, otherwise by month; label with `formatDate`.
- Update `periodLabel` ("Custom range") and `trendLabel` (e.g., "Apr 3 – May 12") accordingly.

Guard: if custom is selected but no range yet, fall back to month behavior and disable the popover close until both dates picked.

## 2. Forgot password flow

Two additions:

**a. Link + dialog on `src/routes/auth.tsx`**
- Under the password field in sign-in mode, add a "Forgot password?" text button.
- Opens a small dialog with an email input and a "Send reset link" button that calls:
  ```ts
  supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset-password`,
  })
  ```
- Toast success/error; close on success.

**b. New public route `src/routes/reset-password.tsx`**
- `createFileRoute("/reset-password")` with `ssr: false`, not under `_authenticated`.
- On mount, Supabase auto-consumes the recovery token in the URL hash and fires `PASSWORD_RECOVERY` via `onAuthStateChange`; render a form with new password + confirm.
- Submit calls `supabase.auth.updateUser({ password })`, toasts success, then navigates to `/auth`.
- Handles the case where the user lands here without a recovery session (show "Link expired, request a new one" with a link back to `/auth`).

No database or server-function changes required — Supabase handles the recovery email and session.

## Files touched
- `src/routes/_authenticated/dashboard.tsx` (edit)
- `src/routes/auth.tsx` (edit — add forgot-password dialog)
- `src/routes/reset-password.tsx` (new)

import type { ComponentType } from 'react'

export interface TemplateEntry {
  component: ComponentType<any>
  subject: string | ((data: Record<string, any>) => string)
  displayName?: string
  previewData?: Record<string, any>
  /** Fixed recipient — overrides caller-provided recipientEmail when set. */
  to?: string
}

/**
 * Template registry — maps template names to their React Email components.
 * Import and register new templates here after creating them in this directory.
 *
 * Example:
 *   import { template as welcomeTemplate } from './welcome'
 *   // then add to TEMPLATES: 'welcome': welcomeTemplate
 */
import { template as businessApprovedTemplate } from './business-approved'
import { template as paymentReceiptTemplate } from './payment-receipt'
import { template as planExpiryReminderTemplate } from './plan-expiry-reminder'

export const TEMPLATES: Record<string, TemplateEntry> = {
  'business-approved': businessApprovedTemplate,
  'payment-receipt': paymentReceiptTemplate,
  'plan-expiry-reminder': planExpiryReminderTemplate,
}

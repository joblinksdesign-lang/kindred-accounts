import React from 'react'
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components'
import type { TemplateEntry } from './registry'

interface Props {
  businessName?: string
  planName?: string
  expiryDate?: string
  daysLeft?: number
  billingUrl?: string
  expired?: boolean
}

const Email = ({ businessName, planName, expiryDate, daysLeft, billingUrl, expired }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>
      {expired
        ? 'Your Softtrack Pos plan has expired'
        : `Your Softtrack Pos plan ends in ${daysLeft ?? 'a few'} day(s)`}
    </Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>{expired ? 'Your plan has expired' : 'Your plan is about to expire'}</Heading>
        <Text style={text}>
          Hello{businessName ? ` ${businessName}` : ''}, your <strong>{planName || 'current'}</strong> plan
          {expired
            ? ` expired on ${expiryDate || 'its renewal date'}. Renew now to keep invoicing, selling and reporting without interruption.`
            : ` ends on ${expiryDate || 'its renewal date'}${
                typeof daysLeft === 'number' ? ` — that is ${daysLeft} day${daysLeft === 1 ? '' : 's'} from now` : ''
              }. Renew or upgrade to avoid any interruption.`}
        </Text>
        <Section style={{ margin: '28px 0' }}>
          <Button style={button} href={billingUrl || 'https://softtrack.online/billing'}>
            Review my plan
          </Button>
        </Section>
        <Hr style={hr} />
        <Text style={muted}>Softtrack Pos — invoicing, receipts, POS and inventory.</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: (data: Record<string, any>) =>
    data['expired'] ? 'Your Softtrack Pos plan has expired' : 'Your Softtrack Pos plan expires soon',
  displayName: 'Plan expiry reminder',
  previewData: {
    businessName: 'Kampala Traders',
    planName: 'Standard',
    expiryDate: '14 Sep 2026',
    daysLeft: 7,
    billingUrl: 'https://softtrack.online/billing',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, Helvetica, sans-serif' }
const container = { padding: '28px 26px', maxWidth: '560px' }
const h1 = { fontSize: '22px', color: '#0f172a', margin: '0 0 14px' }
const text = { fontSize: '15px', lineHeight: '24px', color: '#334155', margin: '0 0 12px' }
const muted = { fontSize: '12px', color: '#94a3b8' }
const hr = { borderColor: '#e2e8f0', margin: '24px 0 14px' }
const button = {
  backgroundColor: '#0f766e',
  color: '#ffffff',
  fontSize: '15px',
  fontWeight: 600,
  padding: '12px 22px',
  borderRadius: '8px',
  textDecoration: 'none',
}

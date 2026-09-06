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
  appUrl?: string
}

const Email = ({ businessName, planName, appUrl }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{businessName ? `${businessName} is approved on Softtrack Pos` : 'Your business is approved'}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Your business is approved</Heading>
        <Text style={text}>
          Good news{businessName ? `, ${businessName}` : ''} — your account on Softtrack Pos has been
          reviewed and approved. You can now sign in and start invoicing, selling at the till and
          tracking your stock.
        </Text>
        {planName ? <Text style={text}>Current plan: <strong>{planName}</strong></Text> : null}
        <Section style={{ margin: '28px 0' }}>
          <Button style={button} href={appUrl || 'https://softtrack.online/dashboard'}>
            Open your dashboard
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
  subject: 'Your business is approved on Softtrack Pos',
  displayName: 'Business approved',
  previewData: { businessName: 'Kampala Traders', planName: 'Standard', appUrl: 'https://softtrack.online/dashboard' },
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

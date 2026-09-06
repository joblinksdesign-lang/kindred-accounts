import React from 'react'
import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Row,
  Column,
  Text,
} from '@react-email/components'
import type { TemplateEntry } from './registry'

interface Props {
  businessName?: string
  customerName?: string
  invoiceNumber?: string
  amount?: string
  method?: string
  paymentDate?: string
  invoiceTotal?: string
  balance?: string
}

const Email = ({
  businessName,
  customerName,
  invoiceNumber,
  amount,
  method,
  paymentDate,
  invoiceTotal,
  balance,
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{`Payment of ${amount || ''} recorded for ${invoiceNumber || 'an invoice'}`}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Payment received</Heading>
        <Text style={text}>
          {businessName ? `${businessName}, a` : 'A'} payment was recorded
          {customerName ? ` from ${customerName}` : ''}.
        </Text>

        <Section label="Invoice" value={invoiceNumber || '—'} />
        <Section label="Amount paid" value={amount || '—'} />
        <Section label="Method" value={method || '—'} />
        <Section label="Date" value={paymentDate || '—'} />
        {invoiceTotal ? <Section label="Invoice total" value={invoiceTotal} /> : null}
        {balance ? <Section label="Balance remaining" value={balance} /> : null}

        <Hr style={hr} />
        <Text style={muted}>Softtrack Pos — invoicing, receipts, POS and inventory.</Text>
      </Container>
    </Body>
  </Html>
)

const Section = ({ label, value }: { label: string; value: string }) => (
  <Row style={{ marginBottom: '6px' }}>
    <Column style={{ fontSize: '14px', color: '#64748b', width: '45%' }}>{label}</Column>
    <Column style={{ fontSize: '14px', color: '#0f172a', fontWeight: 600 }}>{value}</Column>
  </Row>
)

export const template = {
  component: Email,
  subject: (data: Record<string, any>) =>
    data['invoiceNumber'] ? `Payment received for ${data['invoiceNumber']}` : 'Payment received',
  displayName: 'Payment receipt',
  previewData: {
    businessName: 'Kampala Traders',
    customerName: 'Jane Nakato',
    invoiceNumber: 'INV-0042',
    amount: 'USh 250,000',
    method: 'Mobile money',
    paymentDate: '7 Sep 2026',
    invoiceTotal: 'USh 250,000',
    balance: 'USh 0',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, Helvetica, sans-serif' }
const container = { padding: '28px 26px', maxWidth: '560px' }
const h1 = { fontSize: '22px', color: '#0f172a', margin: '0 0 14px' }
const text = { fontSize: '15px', lineHeight: '24px', color: '#334155', margin: '0 0 18px' }
const muted = { fontSize: '12px', color: '#94a3b8' }
const hr = { borderColor: '#e2e8f0', margin: '24px 0 14px' }

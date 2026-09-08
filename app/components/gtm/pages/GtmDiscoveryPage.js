import Head from 'next/head'
import { useState } from 'react'
import GtmLayout from '../GtmLayout'
import { DEFAULT_PRODUCT } from '../../../lib/gtm-products'

const FIELDS = [
  { section: 'Account', fields: [
    ['firm', 'Firm', 'text', true],
    ['contact_name', 'Contact name', 'text'],
    ['contact_email', 'Contact email', 'email'],
    ['contact_role', 'Role', 'text'],
    ['vertical', 'Vertical', 'text'],
  ]},
  { section: 'Architecture', fields: [
    ['site_count', 'Estimated site count', 'text'],
    ['current_shape', 'Current shape (traditional / module MQTT / other)', 'text'],
    ['mqtt_stack', 'MQTT stack', 'text'],
    ['central_applications', 'Central applications', 'text'],
    ['existing_consumers', 'Existing consumers', 'text'],
  ]},
  { section: 'Pain', fields: [
    ['pain_primary', 'Primary pain', 'textarea'],
    ['pain_secondary', 'Secondary pain', 'textarea'],
    ['pain_consequence', 'Business consequence', 'textarea'],
    ['current_workaround', 'Current workaround', 'textarea'],
  ]},
  { section: 'Fit', fields: [
    ['fit', 'Fit (strong / moderate / weak / unknown)', 'text'],
    ['fit_reason', 'One sentence justifying it', 'textarea'],
  ]},
  { section: 'Objections and competitive', fields: [
    ['objections', 'Objections (exact wording, one per line)', 'textarea'],
    ['competitive', 'Competitive (what they run and why)', 'textarea'],
  ]},
  { section: 'Next step', fields: [
    ['next_step', 'Next step (follow-up / technical review / demo / architecture review / partner discussion / not a fit)', 'text'],
    ['next_date', 'Date', 'date'],
    ['next_owner', 'Owner', 'text'],
  ]},
]

// OPS-only baseline metrics form (trade-neutral). Saved via call-reports API
// with kind: 'baseline' so it is distinguished from regular call reports.
const BASELINE_FIELDS = [
  ['office_hours_per_week', 'Office hours per week', 'text'],
  ['quote_turnaround', 'Quote turnaround', 'text'],
  ['close_rate', 'Close rate', 'text'],
  ['days_to_paid', 'Days to paid', 'text'],
  ['reminder_coverage', 'Reminder coverage', 'text'],
  ['missed_visits_per_month', 'Missed visits per month', 'text'],
  ['revenue', 'Revenue', 'text'],
  ['active_accounts', 'Active accounts', 'text'],
]

const EMPTY = {}
for (const group of FIELDS) for (const [key] of group.fields) EMPTY[key] = ''

const EMPTY_BASELINE = {}
for (const [key] of BASELINE_FIELDS) EMPTY_BASELINE[key] = ''

export default function GtmDiscoveryPage({ product = DEFAULT_PRODUCT, session, page }) {
  const isOps = product === 'ops'
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  const [baseline, setBaseline] = useState(EMPTY_BASELINE)
  const [baselineFirm, setBaselineFirm] = useState('')
  const [savingBaseline, setSavingBaseline] = useState(false)
  const [baselineResult, setBaselineResult] = useState(null)
  const [baselineError, setBaselineError] = useState(null)

  function setField(key, value) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function setBaselineField(key, value) {
    setBaseline((f) => ({ ...f, [key]: value }))
  }

  async function submit(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch('/api/gtm/call-reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, product }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'save failed')
      } else {
        setResult(data)
        setForm(EMPTY)
      }
    } catch (err) {
      setError(err.message)
    }
    setSaving(false)
  }

  async function submitBaseline(e) {
    e.preventDefault()
    setSavingBaseline(true)
    setBaselineError(null)
    setBaselineResult(null)
    try {
      const res = await fetch('/api/gtm/call-reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firm: baselineFirm,
          kind: 'baseline',
          product,
          ...baseline,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setBaselineError(data.error || 'save failed')
      } else {
        setBaselineResult(data)
        setBaseline(EMPTY_BASELINE)
      }
    } catch (err) {
      setBaselineError(err.message)
    }
    setSavingBaseline(false)
  }

  return (
    <GtmLayout title="Discovery" session={session} product={product}>
      <Head><title>GTM Discovery · GreenGuard USA</title></Head>

      {page && (
        <div style={{ border: '1px solid var(--border-gold)', borderRadius: 10, padding: '16px 20px', marginBottom: 24 }}
          dangerouslySetInnerHTML={{ __html: page.html }} />
      )}

      <h2 style={{ fontSize: '1.05rem', fontWeight: 800, marginBottom: 12 }}>Call report</h2>

      {result && (
        <div style={{ border: '1px solid var(--border-gold)', borderRadius: 10, padding: '12px 16px', marginBottom: 16 }}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>Saved.</div>
          <div style={{ fontSize: '0.85rem' }}>
            HubSpot contact id: {result.hubspot?.contactId || 'none'}. Note id: {result.hubspot?.noteId || 'none'}. Deal id: {result.hubspot?.dealId || 'none'}.
          </div>
        </div>
      )}
      {result?.warning && (
        <div style={{ border: '1px solid #b45309', background: 'rgba(180,83,9,0.1)', borderRadius: 10, padding: '12px 16px', marginBottom: 16, color: '#b45309' }}>
          {result.warning}
        </div>
      )}
      {error && (
        <div style={{ border: '1px solid #b91c1c', background: 'rgba(185,28,28,0.1)', borderRadius: 10, padding: '12px 16px', marginBottom: 16, color: '#b91c1c' }}>
          {error}
        </div>
      )}

      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 720 }}>
        {FIELDS.map((group) => (
          <div key={group.section}>
            <h3 style={{ fontSize: '0.9rem', fontWeight: 800, marginBottom: 8 }}>{group.section}</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {group.fields.map(([key, label, type, required]) => (
                <label key={key} style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.85rem' }}>
                  {label}
                  {type === 'textarea' ? (
                    <textarea
                      value={form[key]}
                      onChange={(e) => setField(key, e.target.value)}
                      rows={3}
                      style={{ padding: 8, borderRadius: 6, border: '1px solid var(--border-gold)' }}
                    />
                  ) : (
                    <input
                      type={type}
                      value={form[key]}
                      onChange={(e) => setField(key, e.target.value)}
                      required={Boolean(required)}
                      style={{ padding: 8, borderRadius: 6, border: '1px solid var(--border-gold)' }}
                    />
                  )}
                </label>
              ))}
            </div>
          </div>
        ))}

        <button type="submit" disabled={saving} style={{
          alignSelf: 'flex-start',
          padding: '10px 20px',
          borderRadius: 8,
          fontWeight: 800,
          background: 'var(--gold)',
          border: 'none',
          cursor: 'pointer',
        }}>
          {saving ? 'Saving...' : 'Save call report'}
        </button>
      </form>

      {isOps && (
        <div style={{ marginTop: 40 }}>
          <h2 style={{ fontSize: '1.05rem', fontWeight: 800, marginBottom: 12 }}>Baseline metrics</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: 12 }}>
            Capture the operator&apos;s current-state numbers before onboarding.
          </p>

          {baselineResult && (
            <div style={{ border: '1px solid var(--border-gold)', borderRadius: 10, padding: '12px 16px', marginBottom: 16 }}>
              Saved.
            </div>
          )}
          {baselineError && (
            <div style={{ border: '1px solid #b91c1c', background: 'rgba(185,28,28,0.1)', borderRadius: 10, padding: '12px 16px', marginBottom: 16, color: '#b91c1c' }}>
              {baselineError}
            </div>
          )}

          <form onSubmit={submitBaseline} style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 560 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.85rem' }}>
              Firm
              <input
                type="text"
                value={baselineFirm}
                onChange={(e) => setBaselineFirm(e.target.value)}
                required
                style={{ padding: 8, borderRadius: 6, border: '1px solid var(--border-gold)' }}
              />
            </label>
            {BASELINE_FIELDS.map(([key, label]) => (
              <label key={key} style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.85rem' }}>
                {label}
                <input
                  type="text"
                  value={baseline[key]}
                  onChange={(e) => setBaselineField(key, e.target.value)}
                  style={{ padding: 8, borderRadius: 6, border: '1px solid var(--border-gold)' }}
                />
              </label>
            ))}
            <button type="submit" disabled={savingBaseline} style={{
              alignSelf: 'flex-start', padding: '10px 20px', borderRadius: 8, fontWeight: 800,
              background: 'var(--gold)', border: 'none', cursor: 'pointer',
            }}>
              {savingBaseline ? 'Saving...' : 'Save baseline'}
            </button>
          </form>
        </div>
      )}
    </GtmLayout>
  )
}

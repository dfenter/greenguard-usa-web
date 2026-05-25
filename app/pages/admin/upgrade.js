import { useState } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import Link from 'next/link'
import PortalLayout from '../../components/PortalLayout'
import { getSessionFromRequest, isAdminEmail } from '../../lib/auth'
import { findContactByEmail } from '../../lib/hubspot'
import { PATHS, detectCurrentPath } from '../../lib/upgrade-paths'

export async function getServerSideProps({ req, query }) {
  const session = await getSessionFromRequest(req)
  if (!session) return { redirect: { destination: '/login', permanent: false } }
  if (!isAdminEmail(session.email)) return { redirect: { destination: '/dashboard', permanent: false } }

  const email = query.email || ''
  if (!email) return { props: { customer: null, currentPathKey: null, customerName: '' } }

  const contact = await findContactByEmail(email).catch(() => null)
  const props = contact?.properties || {}
  const currentPathKey = detectCurrentPath({
    systemType: props.system_type, trapCount: props.trap_count, planType: props.plan_type,
  })

  return {
    props: {
      customer: { email, contactId: contact?.id || null },
      currentPathKey,
      customerName: [props.firstname, props.lastname].filter(Boolean).join(' ') || email,
      systemType: props.system_type || null,
      trapCount: props.trap_count || null,
    },
  }
}

function Card({ title, monthly, features, accent = '#7dffaa', muted = false }) {
  return (
    <div style={{
      flex: '1 1 280px', minWidth: 260, padding: 18, borderRadius: 12,
      background: muted ? 'rgba(255,255,255,0.03)' : `${accent}11`,
      border: `1px solid ${muted ? 'rgba(122,171,130,0.15)' : `${accent}40`}`,
    }}>
      <div style={{ fontSize: '0.7rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: muted ? 'rgba(212,230,202,0.4)' : accent, marginBottom: 8 }}>
        {muted ? 'Current Plan' : 'Proposed Plan'}
      </div>
      <div style={{ fontSize: '1.05rem', fontWeight: 800, marginBottom: 4, color: '#d4e6ca' }}>{title}</div>
      <div style={{ fontSize: '1.4rem', fontWeight: 900, color: muted ? 'rgba(212,230,202,0.7)' : accent, marginBottom: 12 }}>
        ${monthly.toFixed(2)}<span style={{ fontSize: '0.85rem', fontWeight: 500, opacity: 0.7 }}>/mo</span>
      </div>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: '0.85rem', color: 'rgba(212,230,202,0.75)' }}>
        {features.map((f, i) => (
          <li key={i} style={{ padding: '5px 0', display: 'flex', gap: 8 }}>
            <span style={{ color: muted ? 'rgba(212,230,202,0.4)' : accent }}>✓</span>
            <span>{f}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function UpgradePage({ customer, currentPathKey, customerName, systemType, trapCount }) {
  const [selectedUpgrade, setSelectedUpgrade] = useState(null)
  const [quantity, setQuantity] = useState(2)
  const [running, setRunning] = useState(false)
  const router = useRouter()

  if (!customer) {
    return (
      <PortalLayout isAdmin>
        <Head><title>Upgrade · GreenGuard Admin</title></Head>
        <h1 style={{ fontWeight: 900, marginBottom: 8 }}>Upgrade Service</h1>
        <p style={{ color: 'rgba(212,230,202,0.5)' }}>Open this page with <code>?email=customer@example.com</code>, or jump into a client first via <Link href="/admin/clients" style={{ color: '#7dffaa' }}>All Clients</Link>.</p>
      </PortalLayout>
    )
  }

  const path = PATHS[currentPathKey]
  if (!path) {
    return (
      <PortalLayout isAdmin>
        <h1>Upgrade Service</h1>
        <p>Could not detect a current plan for {customerName}. Set <code>system_type</code> and <code>trap_count</code> in HubSpot first.</p>
      </PortalLayout>
    )
  }

  async function executeUpgrade() {
    if (!selectedUpgrade) return
    const monthly = selectedUpgrade.target.monthly * (selectedUpgrade.kind === 'capacity' && selectedUpgrade.id === 'mq-add-second' ? quantity : 1)
    const confirm = window.confirm(
      `Apply upgrade for ${customerName}?\n\n${selectedUpgrade.title}\n→ ${selectedUpgrade.target.label} · $${selectedUpgrade.target.monthly.toFixed(2)}/mo\n\n` +
      (selectedUpgrade.kind === 'tier' ? 'This CANCELS the current subscription and starts a new one.\n\n' :
       selectedUpgrade.kind === 'addon' ? 'This ADDS a new recurring line. The current plan continues.\n\n' :
       'This swaps the subscription quantity / tier.\n\n') +
      'Customer with card on file → auto-charged.\nNo card → emailed hosted invoice link.\n\nProceed?'
    )
    if (!confirm) return
    setRunning(true)
    const res = await fetch('/api/admin/execute-upgrade', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerEmail: customer.email, upgradeId: selectedUpgrade.id,
        currentPathKey, quantity,
      }),
    })
    const j = await res.json().catch(() => ({}))
    setRunning(false)
    if (res.ok) {
      alert(`✓ Upgrade applied (${j.action}).\nSubscription: ${j.subscriptionId || 'N/A'}${j.replaced ? `\nReplaced: ${j.replaced}` : ''}`)
      router.push(`/admin/clients/${encodeURIComponent(customer.email)}`)
    } else {
      alert(`Failed: ${j.error || res.status}`)
    }
  }

  return (
    <>
      <Head><title>Upgrade · {customerName} · GreenGuard Admin</title></Head>
      <PortalLayout isAdmin>
        <div style={{ marginBottom: 18 }}>
          <Link href={`/admin/clients/${encodeURIComponent(customer.email)}`} style={{ fontSize: '0.82rem', color: 'rgba(212,230,202,0.5)' }}>← Back to {customerName}</Link>
        </div>

        <h1 style={{ fontSize: 'clamp(1.3rem,3vw,1.8rem)', fontWeight: 900, margin: '0 0 4px' }}>Upgrade Options for {customerName}</h1>
        <p style={{ color: 'rgba(212,230,202,0.55)', margin: '0 0 24px', fontSize: '0.92rem' }}>
          Detected from HubSpot: <strong>{systemType || 'unknown'}</strong>{trapCount ? `, ${trapCount} trap${trapCount === '1' ? '' : 's'}` : ''}. {path.upgrades.length} upgrade{path.upgrades.length === 1 ? '' : 's'} available.
        </p>

        {path.upgrades.map((u) => {
          const isSelected = selectedUpgrade?.id === u.id
          const monthly = u.id === 'mq-add-second' ? u.target.monthly * quantity / 2 : u.target.monthly  // already × 2 in catalog
          return (
            <div key={u.id} style={{ marginBottom: 22 }}>
              <div onClick={() => setSelectedUpgrade(u)}
                style={{
                  cursor: 'pointer', padding: '14px 16px',
                  background: isSelected ? 'rgba(125,255,170,0.08)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${isSelected ? '#7dffaa' : 'rgba(122,171,130,0.2)'}`,
                  borderRadius: 10, marginBottom: 12,
                }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                  <div>
                    <div style={{ fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: { capacity: '#5bc4ff', tier: '#c9a84c', addon: '#7dffaa' }[u.kind], marginBottom: 4 }}>
                      {u.kind === 'capacity' ? 'Capacity Upgrade' : u.kind === 'tier' ? 'Tier Upgrade' : 'Add-On'}
                    </div>
                    <div style={{ fontSize: '1rem', fontWeight: 800, color: '#d4e6ca' }}>{u.title}</div>
                  </div>
                  <div style={{ fontSize: '0.78rem', color: '#7dffaa', fontWeight: 700 }}>
                    {isSelected ? '✓ selected' : 'Tap to compare →'}
                  </div>
                </div>
                <p style={{ margin: '8px 0 0', fontSize: '0.85rem', color: 'rgba(212,230,202,0.6)' }}>{u.why}</p>
              </div>

              {isSelected && (
                <>
                  <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 14 }}>
                    <Card title={path.label} monthly={path.monthly} features={path.features} muted />
                    <Card title={u.target.label} monthly={u.target.monthly} features={u.features} accent={{ capacity: '#5bc4ff', tier: '#c9a84c', addon: '#7dffaa' }[u.kind]} />
                  </div>

                  {u.id === 'mq-add-second' && (
                    <div style={{ marginBottom: 12, fontSize: '0.85rem' }}>
                      <label>Total Mosqitters after upgrade: </label>
                      <input type="number" min="2" value={quantity} onChange={(e) => setQuantity(Math.max(2, parseInt(e.target.value) || 2))}
                        style={{ width: 70, padding: '6px 10px', borderRadius: 6, border: '1px solid rgba(122,171,130,0.3)', background: 'rgba(255,255,255,0.04)', color: '#d4e6ca', fontWeight: 700 }} />
                    </div>
                  )}

                  <div style={{ padding: 14, background: 'rgba(201,168,76,0.06)', border: '1px solid rgba(201,168,76,0.25)', borderRadius: 10, marginBottom: 14 }}>
                    <div style={{ fontSize: '0.7rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#c9a84c', marginBottom: 6 }}>Monthly difference</div>
                    <div style={{ fontSize: '1.3rem', fontWeight: 900, color: '#c9a84c' }}>
                      {(u.target.monthly - path.monthly) >= 0 ? '+' : ''}${(u.target.monthly - path.monthly).toFixed(2)}/mo
                    </div>
                    {u.installRequired && (
                      <div style={{ fontSize: '0.78rem', color: 'rgba(212,230,202,0.6)', marginTop: 6 }}>
                        ⚠ Install / equipment swap visit required. Schedule via Cal.com after approval.
                      </div>
                    )}
                  </div>

                  <button onClick={executeUpgrade} disabled={running}
                    style={{ width: '100%', padding: '14px 18px', borderRadius: 8, border: 'none', background: '#7dffaa', color: '#0d1a10', fontWeight: 900, fontSize: '1rem', cursor: running ? 'wait' : 'pointer', fontFamily: 'Nunito Sans, sans-serif' }}>
                    {running ? 'Applying…' : `Apply ${u.kind === 'tier' ? 'Tier Upgrade' : u.kind === 'addon' ? 'Add-On' : 'Capacity Upgrade'}`}
                  </button>
                </>
              )}
            </div>
          )
        })}
      </PortalLayout>
    </>
  )
}

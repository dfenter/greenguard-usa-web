import { useState, useEffect, useMemo } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import PortalLayout from '../../components/PortalLayout'
import { getSessionFromRequest, isAdminEmail } from '../../lib/auth'

export async function getServerSideProps({ req }) {
  const session = await getSessionFromRequest(req)
  if (!session) return { redirect: { destination: '/login', permanent: false } }
  if (!isAdminEmail(session.email)) return { redirect: { destination: '/dashboard', permanent: false } }
  return { props: {} }
}

// Sidebar mirrors Acuity's Reports nav.
const SECTIONS = [
  { key: 'appointments', label: 'Appointments' },
  { key: 'revenue',      label: 'Revenue' },
  { key: 'users',        label: 'Users' },
  { key: 'intake',       label: 'Intake Forms' },
  { key: 'addons',       label: 'Add-ons' },
  { key: 'tips',         label: 'Tips' },
  { key: 'import',       label: 'Import/Export' },
]

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function fmt$(n) { return `$${(n || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}` }

// SVG line chart sized to fill the wrapper.
function LineChart({ series, width = 900, height = 300 }) {
  const pad = { top: 18, right: 30, bottom: 30, left: 40 }
  const w = width - pad.left - pad.right
  const h = height - pad.top - pad.bottom
  const allVals = series.flatMap((s) => s.data)
  const max = Math.max(10, Math.ceil(Math.max(...allVals, 0) * 1.15))
  const xStep = w / (MONTHS.length - 1)
  const yFor = (v) => pad.top + h - (v / max) * h
  const xFor = (i) => pad.left + i * xStep
  const ticks = 4
  const yTicks = Array.from({ length: ticks + 1 }, (_, i) => Math.round((max * i) / ticks))

  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
      {/* grid + y labels */}
      {yTicks.map((v, i) => {
        const y = yFor(v)
        return <g key={i}>
          <line x1={pad.left} x2={pad.left + w} y1={y} y2={y} stroke="rgba(122,171,130,0.12)" />
          <text x={pad.left - 6} y={y + 4} fontSize="10" textAnchor="end" fill="rgba(212,230,202,0.45)">{v}</text>
        </g>
      })}
      {/* x labels */}
      {MONTHS.map((m, i) => (
        <text key={m} x={xFor(i)} y={pad.top + h + 16} fontSize="10" textAnchor="middle" fill="rgba(212,230,202,0.45)">{m}</text>
      ))}
      {/* series */}
      {series.map((s) => {
        const d = s.data.map((v, i) => `${i === 0 ? 'M' : 'L'} ${xFor(i)} ${yFor(v)}`).join(' ')
        return <g key={s.label}>
          <path d={d} fill="none" stroke={s.color} strokeWidth="2" />
          {s.data.map((v, i) => (
            <circle key={i} cx={xFor(i)} cy={yFor(v)} r="3" fill={s.color} />
          ))}
        </g>
      })}
    </svg>
  )
}

export default function ReportsPage() {
  const [section, setSection] = useState('appointments')
  const [year, setYear] = useState(new Date().getFullYear())
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (section !== 'appointments' && section !== 'revenue' && section !== 'addons') return
    setLoading(true)
    fetch(`/api/admin/reports?year=${year}`)
      .then((r) => r.json()).then(setData)
      .catch(() => setData({ error: 'Failed to load' }))
      .finally(() => setLoading(false))
  }, [year, section])

  const series = useMemo(() => data?.monthly ? [
    { label: 'Scheduled', color: '#7dffaa', data: data.monthly },
    { label: 'Canceled',  color: '#c9a84c', data: Array(12).fill(0) },
    { label: 'No Show',   color: '#5bc4ff', data: Array(12).fill(0) },
  ] : [], [data])

  return (
    <>
      <Head><title>Reports · GreenGuard Admin</title></Head>
      <PortalLayout isAdmin>
        <div style={{ display: 'flex', gap: 18, alignItems: 'flex-start' }}>
          {/* Sidebar */}
          <aside style={{ flex: '0 0 180px', position: 'sticky', top: 70, alignSelf: 'flex-start' }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(212,230,202,0.35)', marginBottom: 10, padding: '0 8px' }}>Reports</div>
            <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {SECTIONS.map((s) => (
                <button key={s.key} onClick={() => setSection(s.key)}
                  style={{ textAlign: 'left', padding: '8px 12px', background: section === s.key ? 'rgba(125,255,170,0.08)' : 'transparent', border: 'none', borderLeft: section === s.key ? '2px solid #7dffaa' : '2px solid transparent', color: section === s.key ? '#7dffaa' : 'rgba(212,230,202,0.6)', fontWeight: section === s.key ? 800 : 600, fontSize: '0.88rem', cursor: 'pointer', fontFamily: 'Nunito Sans, sans-serif' }}>
                  {s.label}
                </button>
              ))}
            </nav>
          </aside>

          {/* Main */}
          <main style={{ flex: 1, minWidth: 0 }}>
            {section === 'appointments' && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
                  <h1 style={{ fontSize: 'clamp(1.3rem,2.5vw,1.7rem)', fontWeight: 900, margin: 0 }}>Report for all of {year}</h1>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: '0.82rem' }}>
                    <span style={{ color: 'rgba(212,230,202,0.5)' }}>Year:</span>
                    <select value={year} onChange={(e) => setYear(parseInt(e.target.value, 10))}
                      style={{ padding: '5px 10px', borderRadius: 5, border: '1px solid rgba(122,171,130,0.25)', background: 'rgba(255,255,255,0.04)', color: '#d4e6ca', fontSize: '0.85rem', fontFamily: 'Nunito Sans, sans-serif' }}>
                      {[year + 1, year, year - 1, year - 2].map((y) => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </div>
                </div>

                <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(122,171,130,0.12)', borderRadius: 8, padding: 18, marginBottom: 16 }}>
                  {loading && <div style={{ padding: 40, textAlign: 'center', color: 'rgba(212,230,202,0.4)' }}>Loading…</div>}
                  {!loading && data?.monthly && (
                    <>
                      <LineChart series={series} />
                      <div style={{ display: 'flex', justifyContent: 'center', gap: 18, marginTop: 8, fontSize: '0.78rem' }}>
                        {series.map((s) => (
                          <span key={s.label} style={{ color: s.color, fontWeight: 700 }}>● {s.label}</span>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                {!loading && data?.types && (
                  <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(122,171,130,0.12)', borderRadius: 8, overflow: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                      <thead>
                        <tr style={{ background: 'rgba(255,255,255,0.04)', color: 'rgba(212,230,202,0.55)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                          <th style={{ padding: '10px 14px', textAlign: 'left' }}>Type</th>
                          <th style={{ padding: '10px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>Cost</th>
                          <th style={{ padding: '10px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>Quantity</th>
                          <th style={{ padding: '10px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>Total</th>
                          <th style={{ padding: '10px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>Total Hours</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.types.length === 0 && (
                          <tr><td colSpan={5} style={{ padding: 24, textAlign: 'center', color: 'rgba(212,230,202,0.4)' }}>No appointments for {year}.</td></tr>
                        )}
                        {data.types.map((t) => (
                          <tr key={t.type} style={{ borderTop: '1px solid rgba(122,171,130,0.06)' }}>
                            <td style={{ padding: '9px 14px', fontWeight: 600 }}>{t.type}</td>
                            <td style={{ padding: '9px 14px', textAlign: 'right', color: 'rgba(212,230,202,0.65)' }}>{t.unitCost ? fmt$(t.unitCost) : '—'}</td>
                            <td style={{ padding: '9px 14px', textAlign: 'right', color: 'rgba(212,230,202,0.75)' }}>{t.qty}</td>
                            <td style={{ padding: '9px 14px', textAlign: 'right', fontWeight: 700, color: t.total > 0 ? '#7dffaa' : 'rgba(212,230,202,0.4)' }}>{t.total > 0 ? fmt$(t.total) : '—'}</td>
                            <td style={{ padding: '9px 14px', textAlign: 'right', color: 'rgba(212,230,202,0.6)' }}>{t.totalHours.toFixed(2)}</td>
                          </tr>
                        ))}
                        {data.types.length > 0 && (
                          <tr style={{ borderTop: '2px solid rgba(122,171,130,0.2)', background: 'rgba(125,255,170,0.04)' }}>
                            <td style={{ padding: '11px 14px', fontWeight: 900 }}>Totals</td>
                            <td></td>
                            <td style={{ padding: '11px 14px', textAlign: 'right', fontWeight: 900 }}>{data.totalAppts}</td>
                            <td style={{ padding: '11px 14px', textAlign: 'right', fontWeight: 900, color: '#7dffaa' }}>{fmt$(data.totalRevenue)}</td>
                            <td style={{ padding: '11px 14px', textAlign: 'right', fontWeight: 900 }}>{data.types.reduce((s, t) => s + t.totalHours, 0).toFixed(2)}</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}

            {section === 'revenue' && (
              <div style={{ padding: 28, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(122,171,130,0.12)', borderRadius: 8 }}>
                <h2 style={{ margin: '0 0 10px', fontSize: '1.2rem', fontWeight: 800 }}>Revenue</h2>
                <p style={{ color: 'rgba(212,230,202,0.5)', fontSize: '0.88rem' }}>Detailed revenue breakdowns live on the analytics page.</p>
                <Link href="/admin/analytics?tab=revenue" style={{ display: 'inline-block', marginTop: 8, padding: '8px 14px', borderRadius: 6, background: '#7dffaa', color: '#0d1a10', textDecoration: 'none', fontWeight: 800, fontSize: '0.85rem' }}>
                  Open Revenue Analytics →
                </Link>
              </div>
            )}

            {section === 'users' && (
              <div style={{ padding: 28, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(122,171,130,0.12)', borderRadius: 8 }}>
                <h2 style={{ margin: '0 0 10px', fontSize: '1.2rem', fontWeight: 800 }}>Users</h2>
                <p style={{ color: 'rgba(212,230,202,0.5)', fontSize: '0.88rem' }}>Customer roster, MRR, and per-client history live on the Clients page.</p>
                <Link href="/admin/clients" style={{ display: 'inline-block', marginTop: 8, padding: '8px 14px', borderRadius: 6, background: '#7dffaa', color: '#0d1a10', textDecoration: 'none', fontWeight: 800, fontSize: '0.85rem' }}>
                  Open Clients →
                </Link>
              </div>
            )}

            {section === 'intake' && (
              <div style={{ padding: 28, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(122,171,130,0.12)', borderRadius: 8 }}>
                <h2 style={{ margin: '0 0 10px', fontSize: '1.2rem', fontWeight: 800 }}>Intake Forms</h2>
                <p style={{ color: 'rgba(212,230,202,0.5)', fontSize: '0.88rem' }}>Intake responses are captured by Cal.com during booking. Open a customer&apos;s record on the Clients page to see their service profile.</p>
              </div>
            )}

            {section === 'addons' && !loading && data?.types && (
              <>
                <h1 style={{ fontSize: '1.4rem', fontWeight: 900, margin: '0 0 12px' }}>Add-ons by frequency ({year})</h1>
                <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(122,171,130,0.12)', borderRadius: 8, overflow: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                    <thead>
                      <tr style={{ background: 'rgba(255,255,255,0.04)', color: 'rgba(212,230,202,0.55)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                        <th style={{ padding: '10px 14px', textAlign: 'left' }}>Add-on type</th>
                        <th style={{ padding: '10px 14px', textAlign: 'right' }}>Qty</th>
                        <th style={{ padding: '10px 14px', textAlign: 'right' }}>Revenue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* Heuristic — events whose type is an addon-style service get filtered here.
                          Tightest available signal: anything not BG{N} rental or tank exchange. */}
                      {data.types.filter((t) => /barrier|assessment|pickup|refill check|troubleshoot|installation/i.test(t.type)).map((t) => (
                        <tr key={t.type} style={{ borderTop: '1px solid rgba(122,171,130,0.06)' }}>
                          <td style={{ padding: '9px 14px' }}>{t.type}</td>
                          <td style={{ padding: '9px 14px', textAlign: 'right' }}>{t.qty}</td>
                          <td style={{ padding: '9px 14px', textAlign: 'right', color: '#7dffaa', fontWeight: 700 }}>{fmt$(t.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {section === 'tips' && (
              <div style={{ padding: 28, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(122,171,130,0.12)', borderRadius: 8 }}>
                <h2 style={{ margin: '0 0 10px', fontSize: '1.2rem', fontWeight: 800 }}>Tips</h2>
                <p style={{ color: 'rgba(212,230,202,0.5)', fontSize: '0.88rem' }}>No tipping is collected in the current flow.</p>
              </div>
            )}

            {section === 'import' && (
              <div style={{ padding: 28, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(122,171,130,0.12)', borderRadius: 8 }}>
                <h2 style={{ margin: '0 0 12px', fontSize: '1.2rem', fontWeight: 800 }}>Import / Export</h2>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <a href="/api/admin/export?type=clients" download style={{ padding: '8px 14px', borderRadius: 6, border: '1px solid rgba(122,171,130,0.25)', color: '#7aab82', fontWeight: 700, fontSize: '0.85rem', textDecoration: 'none' }}>Export Clients CSV</a>
                  <a href="/api/admin/export?type=revenue" download style={{ padding: '8px 14px', borderRadius: 6, border: '1px solid rgba(122,171,130,0.25)', color: '#7aab82', fontWeight: 700, fontSize: '0.85rem', textDecoration: 'none' }}>Export Revenue CSV</a>
                  <Link href="/admin/books/upload" style={{ padding: '8px 14px', borderRadius: 6, border: '1px solid rgba(125,255,170,0.35)', color: '#7dffaa', fontWeight: 700, fontSize: '0.85rem', textDecoration: 'none' }}>Import CSV (books)</Link>
                </div>
              </div>
            )}
          </main>
        </div>
      </PortalLayout>
    </>
  )
}

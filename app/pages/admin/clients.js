import Head from 'next/head'
import Link from 'next/link'
import { useState } from 'react'
import PortalLayout from '../../components/PortalLayout'
import { getSessionFromRequest } from '../../lib/auth'
import { listAllContacts } from '../../lib/hubspot'

export async function getServerSideProps({ req }) {
  const session = await getSessionFromRequest(req)
  if (!session || session.email !== (process.env.ADMIN_EMAIL || 'admin@greenguard-usa.com')) {
    return { redirect: { destination: '/dashboard', permanent: false } }
  }

  let clients = []
  try {
    const raw = await listAllContacts(200)
    clients = raw.map((c) => {
      const p = c.properties || {}
      return {
        email: p.email,
        name: [p.firstname, p.lastname].filter(Boolean).join(' ') || null,
        systemType: p.system_type || null,
        trapCount: p.trap_count ? parseInt(p.trap_count, 10) : null,
        address: p.address || null,
        customerType: p.customer_type || null,
      }
    }).filter((c) => c.email && c.email !== 'inventory@greenguard-usa.com')
  } catch {
    clients = []
  }

  return { props: { isAdmin: true, clients } }
}

export default function ClientsPage({ isAdmin, clients }) {
  const [query, setQuery] = useState('')

  const filtered = query
    ? clients.filter((c) => {
        const q = query.toLowerCase()
        return (
          c.email?.toLowerCase().includes(q) ||
          c.name?.toLowerCase().includes(q) ||
          c.address?.toLowerCase().includes(q) ||
          c.systemType?.toLowerCase().includes(q)
        )
      })
    : clients

  return (
    <>
      <Head><title>Clients · GreenGuard Admin</title></Head>
      <PortalLayout title={`Clients (${clients.length})`} isAdmin={isAdmin}>
        {/* Search */}
        <div style={{ marginBottom: 24, maxWidth: 400 }}>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, email, address, system…"
            style={{
              width: '100%', padding: '10px 14px',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(122,171,130,0.25)',
              borderRadius: 6, color: '#d4e6ca', fontSize: '0.9rem',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {filtered.length === 0 ? (
          <div style={{ color: 'rgba(212,230,202,0.4)', fontSize: '0.9rem' }}>
            {query ? 'No clients match your search.' : 'No clients found.'}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
              <thead>
                <tr>
                  {['Name', 'Email', 'System', 'Traps', 'Address'].map((h) => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: '0.75rem', fontWeight: 700, color: 'rgba(212,230,202,0.4)', textTransform: 'uppercase', letterSpacing: '0.07em', borderBottom: '1px solid rgba(122,171,130,0.15)', whiteSpace: 'nowrap' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((client) => (
                  <tr
                    key={client.email}
                    style={{ borderBottom: '1px solid rgba(122,171,130,0.08)', cursor: 'pointer' }}
                    onClick={() => window.location.href = `/admin/clients/${encodeURIComponent(client.email)}`}
                  >
                    <td style={{ padding: '12px 14px', fontWeight: 700 }}>
                      {client.name || <span style={{ color: 'rgba(212,230,202,0.4)' }}>—</span>}
                    </td>
                    <td style={{ padding: '12px 14px', color: 'rgba(212,230,202,0.7)' }}>{client.email}</td>
                    <td style={{ padding: '12px 14px' }}>
                      {client.systemType
                        ? <span style={{ background: 'rgba(125,255,170,0.08)', border: '1px solid rgba(125,255,170,0.2)', borderRadius: 4, padding: '2px 8px', fontSize: '0.78rem', color: '#7dffaa' }}>{client.systemType}</span>
                        : <span style={{ color: 'rgba(212,230,202,0.3)' }}>—</span>}
                    </td>
                    <td style={{ padding: '12px 14px', color: 'rgba(212,230,202,0.7)' }}>
                      {client.trapCount ?? <span style={{ color: 'rgba(212,230,202,0.3)' }}>—</span>}
                    </td>
                    <td style={{ padding: '12px 14px', color: 'rgba(212,230,202,0.55)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {client.address || <span style={{ color: 'rgba(212,230,202,0.3)' }}>—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PortalLayout>
    </>
  )
}

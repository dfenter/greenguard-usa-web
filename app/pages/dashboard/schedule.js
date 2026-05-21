import Head from 'next/head'
import PortalLayout from '../../components/PortalLayout'
import { getSessionFromRequest } from '../../lib/auth'
import { getUpcomingBookingsForEmail, getPastBookingsForEmail } from '../../lib/gcal'

export async function getServerSideProps({ req }) {
  const session = await getSessionFromRequest(req)
  if (!session) return { redirect: { destination: '/login', permanent: false } }

  const [upcoming, past] = await Promise.all([
    getUpcomingBookingsForEmail(session.email, 10).catch(() => []),
    getPastBookingsForEmail(session.email, 5).catch(() => []),
  ])

  const isAdmin = session.email === 'admin@greenguard-usa.com'
  return { props: { upcoming, past, isAdmin } }
}

function formatDateTime(iso) {
  const d = new Date(iso)
  return {
    date: d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }),
    time: d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
  }
}

function BookingRow({ booking, dim = false }) {
  const { date, time } = formatDateTime(booking.startTime)
  return (
    <div className="card" style={{ marginBottom: 12, opacity: dim ? 0.55 : 1, display: 'flex', gap: 20, alignItems: 'center' }}>
      <div style={{ minWidth: 110 }}>
        <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#c9a84c', marginBottom: 2 }}>{date}</div>
        <div style={{ fontSize: '0.85rem', color: 'rgba(212,230,202,0.6)' }}>{time}</div>
      </div>
      <div>
        <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{booking.title}</div>
        {booking.address && (
          <div style={{ fontSize: '0.82rem', color: 'rgba(212,230,202,0.5)', marginTop: 2 }}>{booking.address}</div>
        )}
      </div>
    </div>
  )
}

export default function Schedule({ upcoming, past, isAdmin }) {
  return (
    <>
      <Head><title>Schedule · GreenGuard</title></Head>
      <PortalLayout title="Your Schedule" isAdmin={isAdmin}>
        {upcoming.length === 0 && past.length === 0 && (
          <p style={{ color: 'rgba(212,230,202,0.5)' }}>No appointments found.</p>
        )}

        {upcoming.length > 0 && (
          <section style={{ marginBottom: 40 }}>
            <h2 style={{ fontSize: '0.75rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#c9a84c', marginBottom: 16 }}>
              Upcoming
            </h2>
            {upcoming.map((b) => <BookingRow key={b.id} booking={b} />)}
          </section>
        )}

        {past.length > 0 && (
          <section>
            <h2 style={{ fontSize: '0.75rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(212,230,202,0.35)', marginBottom: 16 }}>
              Recent visits
            </h2>
            {past.map((b) => <BookingRow key={b.id} booking={b} dim />)}
          </section>
        )}
      </PortalLayout>
    </>
  )
}

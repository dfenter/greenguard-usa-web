import Head from 'next/head'
import PortalLayout from '../../components/PortalLayout'
import { getSessionFromRequest } from '../../lib/auth'
import { getBookingsForEmail } from '../../lib/calcom'

export async function getServerSideProps({ req }) {
  const session = await getSessionFromRequest(req)
  if (!session) return { redirect: { destination: '/login', permanent: false } }

  const allBookings = await getBookingsForEmail(session.email).catch(() => [])
  const now = new Date()

  const upcoming = allBookings
    .filter((b) => b.status === 'ACCEPTED' && new Date(b.startTime) >= now)
    .sort((a, b) => new Date(a.startTime) - new Date(b.startTime))
    .slice(0, 10)
    .map((b) => ({ uid: b.uid, title: b.title, startTime: b.startTime, endTime: b.endTime, location: b.location || null }))

  const past = allBookings
    .filter((b) => b.status === 'ACCEPTED' && new Date(b.startTime) < now)
    .sort((a, b) => new Date(b.startTime) - new Date(a.startTime))
    .slice(0, 5)
    .map((b) => ({ uid: b.uid, title: b.title, startTime: b.startTime, endTime: b.endTime }))

  return { props: { upcoming, past } }
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
      <div style={{ minWidth: 100 }}>
        <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#c9a84c', marginBottom: 2 }}>{date}</div>
        <div style={{ fontSize: '0.85rem', color: 'rgba(212,230,202,0.6)' }}>{time}</div>
      </div>
      <div>
        <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{booking.title}</div>
        {booking.location && (
          <div style={{ fontSize: '0.82rem', color: 'rgba(212,230,202,0.5)', marginTop: 2 }}>{booking.location}</div>
        )}
      </div>
    </div>
  )
}

export default function Schedule({ upcoming, past }) {
  return (
    <>
      <Head><title>Schedule · GreenGuard</title></Head>
      <PortalLayout title="Your Schedule">
        {upcoming.length === 0 && past.length === 0 && (
          <p style={{ color: 'rgba(212,230,202,0.5)' }}>No appointments found.</p>
        )}

        {upcoming.length > 0 && (
          <section style={{ marginBottom: 40 }}>
            <h2 style={{ fontSize: '0.75rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#c9a84c', marginBottom: 16 }}>
              Upcoming
            </h2>
            {upcoming.map((b) => <BookingRow key={b.uid} booking={b} />)}
          </section>
        )}

        {past.length > 0 && (
          <section>
            <h2 style={{ fontSize: '0.75rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(212,230,202,0.35)', marginBottom: 16 }}>
              Recent visits
            </h2>
            {past.map((b) => <BookingRow key={b.uid} booking={b} dim />)}
          </section>
        )}
      </PortalLayout>
    </>
  )
}

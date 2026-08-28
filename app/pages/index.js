import { getSessionFromRequest, isAdminEmail, isOwnerEmail } from '../lib/auth'
const biz = require('../lib/business.config')

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || biz.ownerEmail

export async function getServerSideProps({ req }) {
  const session = await getSessionFromRequest(req)
  if (!session) return { redirect: { destination: '/login', permanent: false } }
  // The PWA starts here, so this is where a crew member lands on every launch.
  // Only the owner belongs on /admin/home (Stripe balances, invoices, clients).
  const dest = isOwnerEmail(session.email)
    ? '/admin/home'
    : isAdminEmail(session.email) ? '/admin/tech' : '/dashboard'
  return { redirect: { destination: dest, permanent: false } }
}

export default function Home() {
  return null
}

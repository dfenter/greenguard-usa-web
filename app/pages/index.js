import { getSessionFromRequest, isAdminEmail } from '../lib/auth'

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@greenguard-usa.com'

export async function getServerSideProps({ req }) {
  const session = await getSessionFromRequest(req)
  if (!session) return { redirect: { destination: '/login', permanent: false } }
  const dest = isAdminEmail(session.email) ? '/admin/home' : '/dashboard'
  return { redirect: { destination: dest, permanent: false } }
}

export default function Home() {
  return null
}

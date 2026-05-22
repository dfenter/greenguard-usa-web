import { getSessionFromRequest } from '../lib/auth'

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@greenguard-usa.com'

export async function getServerSideProps({ req }) {
  const session = await getSessionFromRequest(req)
  if (!session) return { redirect: { destination: '/login', permanent: false } }
  const dest = session.email === ADMIN_EMAIL ? '/admin/analytics' : '/dashboard'
  return { redirect: { destination: dest, permanent: false } }
}

export default function Home() {
  return null
}

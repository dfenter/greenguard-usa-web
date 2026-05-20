import { getSessionFromRequest } from '../lib/auth'

export async function getServerSideProps({ req }) {
  const session = await getSessionFromRequest(req)
  return {
    redirect: {
      destination: session ? '/dashboard' : '/login',
      permanent: false,
    },
  }
}

export default function Home() {
  return null
}

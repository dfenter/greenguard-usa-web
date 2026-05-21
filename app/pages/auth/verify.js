// This page is never rendered — the API route /api/auth/verify handles the redirect.
// Kept as a fallback in case JS routing intercepts the URL.
import { useEffect } from 'react'
import { useRouter } from 'next/router'

export default function Verify() {
  const router = useRouter()
  useEffect(() => {
    if (router.query.token) {
      window.location.href = `/api/auth/verify?token=${router.query.token}`
    }
  }, [router.query.token])
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: '#d4e6ca' }}>Signing you in…</p>
    </div>
  )
}

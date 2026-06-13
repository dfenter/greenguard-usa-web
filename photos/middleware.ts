export { auth as middleware } from './lib/auth'

export const config = {
  matcher: ['/((?!api/auth|signin|_next/static|_next/image|favicon.ico|airflow\\.html|co2\\.html).*)'],
}

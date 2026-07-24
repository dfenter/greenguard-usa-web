import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'

const allowedEmails = (process.env.ALLOWED_EMAILS ?? '')
  .split(',')
  .map(e => e.trim().toLowerCase())
  .filter(Boolean)

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  // Persistent login: keep the session (and its cookie) valid for a year and
  // refresh the expiry on activity, so signing in once sticks across restarts.
  session: {
    strategy: 'jwt',
    maxAge: 60 * 60 * 24 * 365,
    updateAge: 60 * 60 * 24,
  },
  providers: [
    Google({
      clientId: process.env.PHOTOS_GOOGLE_CLIENT_ID,
      clientSecret: process.env.PHOTOS_GOOGLE_CLIENT_SECRET,
    }),
  ],
  callbacks: {
    signIn({ user }) {
      console.log('signIn attempt:', user.email, '| allowed:', allowedEmails)
      if (!user.email) return false
      if (allowedEmails.length === 0) return true
      return allowedEmails.includes(user.email.toLowerCase())
    },
    // Gate every matched route (pages AND the /api/photos, /api/img/* etc. data
    // routes) on a valid session. Without this the middleware attaches the
    // session but never blocks, leaving the gallery APIs publicly readable.
    authorized({ auth }) {
      return !!auth?.user
    },
  },
  pages: {
    signIn: '/signin',
    error: '/signin',
  },
})

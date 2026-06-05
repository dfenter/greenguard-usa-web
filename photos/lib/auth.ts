import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'

const allowedEmails = (process.env.ALLOWED_EMAILS ?? '')
  .split(',')
  .map(e => e.trim().toLowerCase())
  .filter(Boolean)

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
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
  },
  pages: {
    signIn: '/signin',
    error: '/signin',
  },
})

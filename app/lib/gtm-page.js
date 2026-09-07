// Shared getServerSideProps guard for /gtm/* pages: requires a session with
// role gtm or owner, otherwise redirects. Mirrors the pattern in
// pages/admin/inventory.js.
const { getSessionFromRequest, isGtmEmail, isOwnerEmail } = require('./auth')

function gtmServerSideProps(loader) {
  return async function getServerSideProps(ctx) {
    const { req, res } = ctx
    const session = await getSessionFromRequest(req, res)
    if (!session) return { redirect: { destination: '/login', permanent: false } }
    if (!(isGtmEmail(session.email) || isOwnerEmail(session.email))) {
      return { redirect: { destination: '/dashboard', permanent: false } }
    }
    const extra = loader ? await loader(ctx, session) : {}
    if (extra && extra.redirect) return extra
    return { props: { session, ...(extra && extra.props ? extra.props : {}) } }
  }
}

module.exports = { gtmServerSideProps }

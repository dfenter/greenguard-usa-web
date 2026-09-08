import GtmOutreachPage from '../../components/gtm/pages/GtmOutreachPage'
import { gtmServerSideProps } from '../../lib/gtm-page'
import { getPage, getTargets } from '../../lib/gtm-content'

export const getServerSideProps = gtmServerSideProps(() => {
  const firstEmail = getPage('07-outreach/outreach-first-email', 'sparkbridge')
  const sequence = getPage('07-outreach/outreach-sequence', 'sparkbridge')
  const { rows } = getTargets('sparkbridge')
  const targets = rows.map((r) => ({ firm: r.firm, person: r.person, hook: r.hook }))
  return { props: { firstEmail, sequence, targets } }
})

export default function GtmOutreach({ session, firstEmail, sequence, targets }) {
  return <GtmOutreachPage product="sparkbridge" session={session} firstEmail={firstEmail} sequence={sequence} targets={targets} />
}

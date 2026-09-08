import GtmOutreachPage from '../../../components/gtm/pages/GtmOutreachPage'
import { gtmServerSideProps } from '../../../lib/gtm-page'
import { getPage, getTargets } from '../../../lib/gtm-content'

export const getServerSideProps = gtmServerSideProps(() => {
  const firstEmail = getPage('07-outreach/first-email', 'ops')
  const sequence = getPage('07-outreach/sequence', 'ops')
  const { rows } = getTargets('ops')
  const targets = rows.map((r) => ({ firm: r.firm, person: r.person, hook: r.hook }))
  return { props: { firstEmail, sequence, targets } }
})

export default function GtmOpsOutreach({ session, firstEmail, sequence, targets }) {
  return <GtmOutreachPage product="ops" session={session} firstEmail={firstEmail} sequence={sequence} targets={targets} />
}

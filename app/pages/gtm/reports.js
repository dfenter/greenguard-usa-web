import GtmReportsPage from '../../components/gtm/pages/GtmReportsPage'
import { gtmServerSideProps } from '../../lib/gtm-page'
import { getPage } from '../../lib/gtm-content'

export const getServerSideProps = gtmServerSideProps(() => {
  const leadershipPage = getPage('11-reports/leadership-review-template', 'sparkbridge')
  return { props: { leadershipPage } }
})

export default function GtmReports({ session, leadershipPage }) {
  return <GtmReportsPage product="sparkbridge" session={session} leadershipPage={leadershipPage} />
}

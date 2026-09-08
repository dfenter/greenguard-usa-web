import GtmReportsPage from '../../../components/gtm/pages/GtmReportsPage'
import { gtmServerSideProps } from '../../../lib/gtm-page'
import { getPage } from '../../../lib/gtm-content'

export const getServerSideProps = gtmServerSideProps(() => {
  const leadershipPage = getPage('11-reports/kpi-template', 'ops')
  return { props: { leadershipPage } }
})

export default function GtmOpsReports({ session, leadershipPage }) {
  return <GtmReportsPage product="ops" session={session} leadershipPage={leadershipPage} />
}

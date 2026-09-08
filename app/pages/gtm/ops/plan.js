import GtmPlanPage from '../../../components/gtm/pages/GtmPlanPage'
import { gtmServerSideProps } from '../../../lib/gtm-page'
import { getPage } from '../../../lib/gtm-content'

export const getServerSideProps = gtmServerSideProps(() => {
  const page = getPage('01-plan/ops-90-day-gtm-sprint', 'ops')
  return { props: { page } }
})

export default function GtmOpsPlan({ session, page }) {
  return <GtmPlanPage product="ops" session={session} page={page} />
}

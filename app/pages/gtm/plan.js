import GtmPlanPage from '../../components/gtm/pages/GtmPlanPage'
import { gtmServerSideProps } from '../../lib/gtm-page'
import { getPage } from '../../lib/gtm-content'

export const getServerSideProps = gtmServerSideProps(() => {
  const page = getPage('01-plan/mba-90-day-gtm-sprint', 'sparkbridge')
  return { props: { page } }
})

export default function GtmPlan({ session, page }) {
  return <GtmPlanPage product="sparkbridge" session={session} page={page} />
}

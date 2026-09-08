import GtmDashboardPage from '../../components/gtm/pages/GtmDashboardPage'
import { gtmServerSideProps } from '../../lib/gtm-page'
import { getChecklist } from '../../lib/gtm-content'

export const getServerSideProps = gtmServerSideProps(() => {
  const items = getChecklist('sparkbridge')
  return { props: { items } }
})

export default function GtmIndex({ session, items }) {
  return <GtmDashboardPage product="sparkbridge" session={session} items={items} />
}

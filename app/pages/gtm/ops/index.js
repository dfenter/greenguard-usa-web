import GtmDashboardPage from '../../../components/gtm/pages/GtmDashboardPage'
import { gtmServerSideProps } from '../../../lib/gtm-page'
import { getChecklist } from '../../../lib/gtm-content'

export const getServerSideProps = gtmServerSideProps(() => {
  const items = getChecklist('ops')
  return { props: { items } }
})

export default function GtmOpsIndex({ session, items }) {
  return <GtmDashboardPage product="ops" session={session} items={items} />
}

import GtmTimelinePage from '../../../components/gtm/pages/GtmTimelinePage'
import { gtmServerSideProps } from '../../../lib/gtm-page'
import { getChecklist } from '../../../lib/gtm-content'

export const getServerSideProps = gtmServerSideProps(() => {
  const items = getChecklist('ops')
  return { props: { items } }
})

export default function GtmOpsTimeline({ session, items }) {
  return <GtmTimelinePage product="ops" session={session} items={items} />
}

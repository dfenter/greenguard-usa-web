import GtmTimelinePage from '../../components/gtm/pages/GtmTimelinePage'
import { gtmServerSideProps } from '../../lib/gtm-page'
import { getChecklist } from '../../lib/gtm-content'

export const getServerSideProps = gtmServerSideProps(() => {
  const items = getChecklist('sparkbridge')
  return { props: { items } }
})

export default function GtmTimeline({ session, items }) {
  return <GtmTimelinePage product="sparkbridge" session={session} items={items} />
}

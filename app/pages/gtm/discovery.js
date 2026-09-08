import GtmDiscoveryPage from '../../components/gtm/pages/GtmDiscoveryPage'
import { gtmServerSideProps } from '../../lib/gtm-page'
import { getPage } from '../../lib/gtm-content'

export const getServerSideProps = gtmServerSideProps(() => {
  const page = getPage('08-discovery-call-and-report', 'sparkbridge')
  return { props: { page } }
})

export default function GtmDiscovery({ session, page }) {
  return <GtmDiscoveryPage product="sparkbridge" session={session} page={page} />
}

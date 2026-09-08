import GtmDiscoveryPage from '../../../components/gtm/pages/GtmDiscoveryPage'
import { gtmServerSideProps } from '../../../lib/gtm-page'
import { getPage } from '../../../lib/gtm-content'

export const getServerSideProps = gtmServerSideProps(() => {
  const page = getPage('08-discovery-and-baseline', 'ops')
  return { props: { page } }
})

export default function GtmOpsDiscovery({ session, page }) {
  return <GtmDiscoveryPage product="ops" session={session} page={page} />
}

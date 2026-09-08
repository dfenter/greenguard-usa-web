import GtmInternalPage from '../../../components/gtm/pages/GtmInternalPage'
import { gtmServerSideProps } from '../../../lib/gtm-page'
import { getPage } from '../../../lib/gtm-content'

const INTERNAL_PATHS = [
  '05-icp-INTERNAL',
  '13-implementation-playbook-INTERNAL',
  '15-product-calendar',
]

export const getServerSideProps = gtmServerSideProps(() => {
  const pages = INTERNAL_PATHS.map((p) => getPage(p, 'ops')).filter(Boolean)
  return { props: { pages } }
})

export default function GtmOpsInternal({ session, pages }) {
  return <GtmInternalPage product="ops" session={session} pages={pages} />
}

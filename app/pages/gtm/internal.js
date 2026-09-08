import GtmInternalPage from '../../components/gtm/pages/GtmInternalPage'
import { gtmServerSideProps } from '../../lib/gtm-page'
import { getPage } from '../../lib/gtm-content'

const INTERNAL_PATHS = [
  '05-design-partner-offer-INTERNAL',
  '13-product-themes-INTERNAL',
  '15-crm-and-product-calendar',
]

export const getServerSideProps = gtmServerSideProps(() => {
  const pages = INTERNAL_PATHS.map((p) => getPage(p, 'sparkbridge')).filter(Boolean)
  return { props: { pages } }
})

export default function GtmInternal({ session, pages }) {
  return <GtmInternalPage product="sparkbridge" session={session} pages={pages} />
}

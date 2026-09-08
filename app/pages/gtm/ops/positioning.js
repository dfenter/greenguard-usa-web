import GtmPositioningPage from '../../../components/gtm/pages/GtmPositioningPage'
import { gtmServerSideProps } from '../../../lib/gtm-page'
import { getPage } from '../../../lib/gtm-content'

const POSITIONING_PATHS = [
  '12-positioning/before-vs-after',
  '12-positioning/bookkeeping-positioning-review',
  '12-positioning/homepage-who-this-is-for',
  '12-positioning/payroll-positioning-review',
  '12-positioning/private-office-computer',
]

export const getServerSideProps = gtmServerSideProps(() => {
  const pages = POSITIONING_PATHS.map((p) => getPage(p, 'ops')).filter(Boolean)
  return { props: { pages } }
})

export default function GtmOpsPositioning({ session, pages }) {
  return <GtmPositioningPage product="ops" session={session} pages={pages} />
}

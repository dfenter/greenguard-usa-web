import GtmTargetDetailPage from '../../../components/gtm/pages/GtmTargetDetailPage'
import { gtmServerSideProps } from '../../../lib/gtm-page'
import { slugifyFirm } from '../../../lib/gtm-slug'
import { getTargets } from '../../../lib/gtm-content'

export const getServerSideProps = gtmServerSideProps((ctx) => {
  const { slug } = ctx.params
  const { rows } = getTargets('sparkbridge')
  const row = rows.find((r) => slugifyFirm(r.firm) === slug)
  if (!row) return { redirect: { destination: '/gtm/targets', permanent: false } }
  return { props: { row } }
})

export default function GtmFirmPage({ session, row }) {
  return <GtmTargetDetailPage product="sparkbridge" session={session} row={row} />
}

import GtmTargetDetailPage from '../../../../components/gtm/pages/GtmTargetDetailPage'
import { gtmServerSideProps } from '../../../../lib/gtm-page'
import { slugifyFirm } from '../../../../lib/gtm-slug'
import { getTargets } from '../../../../lib/gtm-content'

export const getServerSideProps = gtmServerSideProps((ctx) => {
  const { slug } = ctx.params
  const { rows } = getTargets('ops')
  const row = rows.find((r) => slugifyFirm(r.firm) === slug)
  if (!row) return { redirect: { destination: '/gtm/ops/targets', permanent: false } }
  return { props: { row } }
})

export default function GtmOpsFirmPage({ session, row }) {
  return <GtmTargetDetailPage product="ops" session={session} row={row} />
}

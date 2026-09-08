import GtmTargetsPage from '../../../components/gtm/pages/GtmTargetsPage'
import { gtmServerSideProps } from '../../../lib/gtm-page'

export const getServerSideProps = gtmServerSideProps()

export default function GtmOpsTargets({ session }) {
  return <GtmTargetsPage product="ops" session={session} />
}

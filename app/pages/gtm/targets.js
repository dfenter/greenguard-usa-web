import GtmTargetsPage from '../../components/gtm/pages/GtmTargetsPage'
import { gtmServerSideProps } from '../../lib/gtm-page'

export const getServerSideProps = gtmServerSideProps()

export default function GtmTargets({ session }) {
  return <GtmTargetsPage product="sparkbridge" session={session} />
}

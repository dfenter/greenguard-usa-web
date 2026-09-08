import GtmCompetitivePage from '../../../components/gtm/pages/GtmCompetitivePage'
import { gtmServerSideProps } from '../../../lib/gtm-page'

export const getServerSideProps = gtmServerSideProps()

export default function GtmOpsCompetitive({ session }) {
  return <GtmCompetitivePage product="ops" session={session} />
}

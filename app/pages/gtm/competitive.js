import GtmCompetitivePage from '../../components/gtm/pages/GtmCompetitivePage'
import { gtmServerSideProps } from '../../lib/gtm-page'

export const getServerSideProps = gtmServerSideProps()

export default function GtmCompetitive({ session }) {
  return <GtmCompetitivePage product="sparkbridge" session={session} />
}

import GtmObjectionsPage from '../../components/gtm/pages/GtmObjectionsPage'
import { gtmServerSideProps } from '../../lib/gtm-page'

export const getServerSideProps = gtmServerSideProps()

export default function GtmObjections({ session }) {
  return <GtmObjectionsPage product="sparkbridge" session={session} />
}

import GtmObjectionsPage from '../../../components/gtm/pages/GtmObjectionsPage'
import { gtmServerSideProps } from '../../../lib/gtm-page'

export const getServerSideProps = gtmServerSideProps()

export default function GtmOpsObjections({ session }) {
  return <GtmObjectionsPage product="ops" session={session} />
}

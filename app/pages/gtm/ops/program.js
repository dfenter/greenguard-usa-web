import GtmProgramPage from '../../../components/gtm/pages/GtmProgramPage'
import { gtmServerSideProps } from '../../../lib/gtm-page'
import { getPage } from '../../../lib/gtm-content'

export const getServerSideProps = gtmServerSideProps(() => {
  const page = getPage('04-program/ten-operator-program', 'ops')
  return { props: { page } }
})

export default function GtmOpsProgram({ session, page }) {
  return <GtmProgramPage product="ops" session={session} page={page} />
}

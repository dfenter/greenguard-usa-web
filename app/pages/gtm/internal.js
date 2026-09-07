import Head from 'next/head'
import GtmLayout from '../../components/gtm/GtmLayout'
import { gtmServerSideProps } from '../../lib/gtm-page'
import { getPage } from '../../lib/gtm-content'

const INTERNAL_PATHS = [
  '05-design-partner-offer-INTERNAL',
  '13-product-themes-INTERNAL',
  '15-crm-and-product-calendar',
]

export const getServerSideProps = gtmServerSideProps(() => {
  const pages = INTERNAL_PATHS.map((p) => getPage(p)).filter(Boolean)
  return { props: { pages } }
})

export default function GtmInternal({ session, pages }) {
  return (
    <GtmLayout title="Internal" session={session}>
      <Head><title>GTM Internal · GreenGuard USA</title></Head>
      <div style={{
        background: 'rgba(179,38,30,0.08)',
        border: '1px solid var(--danger)',
        borderRadius: 8,
        padding: '12px 16px',
        fontWeight: 700,
        marginBottom: 24,
      }}>
        Internal, not for prospects.
      </div>
      {pages.length === 0 && <p>Internal content not built yet. Run scripts/build-gtm-content.js.</p>}
      {pages.map((page) => (
        <div key={page.path} style={{ marginBottom: 40 }}>
          <div dangerouslySetInnerHTML={{ __html: page.html }} style={{ lineHeight: 1.6 }} />
        </div>
      ))}
    </GtmLayout>
  )
}

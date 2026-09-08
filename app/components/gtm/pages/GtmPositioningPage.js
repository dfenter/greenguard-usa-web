import Head from 'next/head'
import GtmLayout from '../GtmLayout'
import { DEFAULT_PRODUCT } from '../../../lib/gtm-products'

export default function GtmPositioningPage({ product = DEFAULT_PRODUCT, session, pages = [] }) {
  return (
    <GtmLayout title="Positioning" session={session} product={product}>
      <Head><title>GTM Positioning · GreenGuard USA</title></Head>
      {pages.length === 0 && <p>Positioning content not built yet. Run scripts/build-gtm-content.js.</p>}
      {pages.map((page) => (
        <div key={page.path} style={{ marginBottom: 40 }}>
          <div style={{ lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: page.html }} />
        </div>
      ))}
    </GtmLayout>
  )
}

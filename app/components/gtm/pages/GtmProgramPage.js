import Head from 'next/head'
import GtmLayout from '../GtmLayout'
import { DEFAULT_PRODUCT } from '../../../lib/gtm-products'

export default function GtmProgramPage({ product = DEFAULT_PRODUCT, session, page }) {
  return (
    <GtmLayout title="Program" session={session} product={product}>
      <Head><title>GTM Program · GreenGuard USA</title></Head>
      {!page && <p>Program content not built yet. Run scripts/build-gtm-content.js.</p>}
      {page && (
        <div style={{ lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: page.html }} />
      )}
    </GtmLayout>
  )
}

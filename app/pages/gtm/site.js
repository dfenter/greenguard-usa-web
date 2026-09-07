import Head from 'next/head'
import GtmLayout from '../../components/gtm/GtmLayout'
import { gtmServerSideProps } from '../../lib/gtm-page'
import { getPdfList } from '../../lib/gtm-content'

export const getServerSideProps = gtmServerSideProps(() => {
  const pdfs = getPdfList().filter((f) => f.startsWith('12-site-pages__'))
  return { props: { pdfs } }
})

function labelFor(fileName) {
  const base = fileName.replace('12-site-pages__', '').replace(/\.pdf$/i, '')
  return base.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export default function GtmSite({ session, pdfs }) {
  return (
    <GtmLayout title="Site pages" session={session}>
      <Head><title>GTM Site pages — GreenGuard USA</title></Head>
      <p>Snapshots of the live SparkBridge site pages. Always defer to the live site as source of truth.</p>
      {pdfs.length === 0 && <p>No site page PDFs found. Run scripts/build-gtm-content.js.</p>}
      {pdfs.map((f) => (
        <div key={f} style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 800 }}>{labelFor(f)}</h2>
          <a href={`/gtm/${f}`} target="_blank" rel="noreferrer">Open PDF</a>
          <div style={{ border: '1px solid var(--border-gold)', borderRadius: 8, marginTop: 8 }}>
            <iframe src={`/gtm/${f}`} title={labelFor(f)} style={{ width: '100%', height: 560, border: 0 }} />
          </div>
        </div>
      ))}
    </GtmLayout>
  )
}

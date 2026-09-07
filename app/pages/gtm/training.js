import Head from 'next/head'
import GtmLayout from '../../components/gtm/GtmLayout'
import { gtmServerSideProps } from '../../lib/gtm-page'
import { getPdfList } from '../../lib/gtm-content'

export const getServerSideProps = gtmServerSideProps(() => {
  const pdfs = getPdfList().filter((f) => f.startsWith('02-training__'))
  return { props: { pdfs } }
})

function labelFor(fileName) {
  const base = fileName.replace('02-training__', '').replace(/\.pdf$/i, '')
  return base.replace(/[-_]/g, ' ')
}

export default function GtmTraining({ session, pdfs }) {
  return (
    <GtmLayout title="Training" session={session}>
      <Head><title>GTM Training — GreenGuard USA</title></Head>
      <p>SE training modules, quiz, and price cheat sheet. Certification checklist arrives in wave 3.</p>
      {pdfs.length === 0 && <p>No training PDFs found. Run scripts/build-gtm-content.js.</p>}
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

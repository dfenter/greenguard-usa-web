import Head from 'next/head'
import GtmLayout from '../../components/gtm/GtmLayout'
import { gtmServerSideProps } from '../../lib/gtm-page'
import { getPage, getPdfList } from '../../lib/gtm-content'

export const getServerSideProps = gtmServerSideProps(() => {
  const page = getPage('04-partner-program/partner-program-terms')
  const pdfs = getPdfList().filter((f) => f.startsWith('04-partner-program__'))
  return { props: { page, pdfs } }
})

export default function GtmPartners({ session, page, pdfs }) {
  return (
    <GtmLayout title="Partner program" session={session}>
      <Head><title>GTM Partners · GreenGuard USA</title></Head>
      {page ? (
        <div dangerouslySetInnerHTML={{ __html: page.html }} style={{ lineHeight: 1.6 }} />
      ) : (
        <p>Partner program content not built yet. Run scripts/build-gtm-content.js.</p>
      )}
      {pdfs.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 800 }}>PDFs</h2>
          <ul>
            {pdfs.map((f) => (
              <li key={f}><a href={`/gtm/${f}`} target="_blank" rel="noreferrer">{f}</a></li>
            ))}
          </ul>
        </div>
      )}
    </GtmLayout>
  )
}

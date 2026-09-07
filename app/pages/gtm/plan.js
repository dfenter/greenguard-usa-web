import Head from 'next/head'
import GtmLayout from '../../components/gtm/GtmLayout'
import { gtmServerSideProps } from '../../lib/gtm-page'
import { getPage } from '../../lib/gtm-content'

export const getServerSideProps = gtmServerSideProps(() => {
  const page = getPage('01-plan/mba-90-day-gtm-sprint')
  return { props: { page } }
})

export default function GtmPlan({ session, page }) {
  if (!page) {
    return (
      <GtmLayout title="90-Day Plan" session={session}>
        <p>Plan content not built yet. Run scripts/build-gtm-content.js.</p>
      </GtmLayout>
    )
  }

  const sideHeadings = page.headings.filter((h) => h.level === 2)

  return (
    <GtmLayout title={page.title} session={session}>
      <Head><title>GTM Plan — GreenGuard USA</title></Head>
      <div className="gtm-plan-layout">
        <nav className="gtm-plan-sidenav" aria-label="Plan sections">
          {sideHeadings.map((h) => (
            <a key={h.id} href={`#${h.id}`}>{h.text}</a>
          ))}
        </nav>
        <div className="gtm-plan-body" dangerouslySetInnerHTML={{ __html: page.html }} />
      </div>
      <style jsx>{`
        .gtm-plan-layout { display: flex; gap: 28px; align-items: flex-start; }
        .gtm-plan-sidenav {
          flex: 0 0 220px;
          position: sticky;
          top: 96px;
          display: flex;
          flex-direction: column;
          gap: 6px;
          max-height: calc(100vh - 120px);
          overflow-y: auto;
          font-size: 0.85rem;
        }
        .gtm-plan-sidenav a {
          color: var(--text-muted);
          text-decoration: none;
          padding: 3px 0;
        }
        .gtm-plan-sidenav a:hover { color: var(--gold); }
        .gtm-plan-body { flex: 1; min-width: 0; line-height: 1.6; }
        @media (max-width: 780px) {
          .gtm-plan-layout { flex-direction: column; }
          .gtm-plan-sidenav { position: static; max-height: none; flex-direction: row; flex-wrap: wrap; }
        }
      `}</style>
    </GtmLayout>
  )
}

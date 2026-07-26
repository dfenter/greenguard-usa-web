// Printable paystub / earnings statement.
//   /admin/paystub?run=12&employee=3
// Data is fetched server-side so the page prints straight from the phone or
// desktop with no client fetch flash. The owner can open anybody's stub; an
// employee can only open their own.
//
// Deliberately self-contained styling (like invoice-pdf.js) — this sheet has to
// look the same in print as on screen, so it does not use the portal tokens.
import Head from 'next/head'
import { getSessionFromRequest, isAdminEmail, isOwnerEmail } from '../../lib/auth'
import { getRunWithItems, getSettings, getEmployeeByEmail, ytdTotals } from '../../lib/payroll-store'

export async function getServerSideProps({ req, res, query }) {
  res?.setHeader('Cache-Control', 'no-store')
  const session = await getSessionFromRequest(req, res)
  if (!session) return { redirect: { destination: '/login', permanent: false } }
  if (!isAdminEmail(session.email)) return { redirect: { destination: '/dashboard', permanent: false } }

  const runId = Number(query.run)
  const employeeId = Number(query.employee)
  if (!runId || !employeeId) return { notFound: true }

  const owner = isOwnerEmail(session.email)
  if (!owner) {
    const me = await getEmployeeByEmail(session.email)
    if (!me || me.id !== employeeId) return { notFound: true }
  }

  const data = await getRunWithItems(runId)
  if (!data) return { notFound: true }
  const item = data.items.find((i) => i.employeeId === employeeId)
  if (!item) return { notFound: true }
  // An employee sees their own FINALIZED stub only. A draft or voided run is
  // internal, and its header carries company-wide figures.
  if (!owner && data.run.status !== 'finalized') return { notFound: true }

  const [settings, ytd] = await Promise.all([
    getSettings(),
    ytdTotals({ employeeId, year: data.run.taxYear, throughPayDate: data.run.payDate }),
  ])

  // Everything below is serialized into __NEXT_DATA__ in the employee's
  // browser, so it is projected down to what the sheet actually prints.
  // getSettings() also carries the SUTA rate and TWC account, and the full run
  // header carries company-wide gross/tax/net totals and who ran payroll.
  const printable = {
    legalName: settings.legalName,
    address: settings.address,
    // The EIN belongs on an employer's own copy, not in every crew payload.
    ein: owner ? settings.ein : null,
  }
  const run = owner ? data.run : {
    id: data.run.id,
    periodStart: data.run.periodStart,
    periodEnd: data.run.periodEnd,
    payDate: data.run.payDate,
    status: data.run.status,
  }
  return { props: { run, item, settings: printable, ytd } }
}

const usd = (cents) => ((Number(cents) || 0) / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
const hrs = (h) => (Number(h) || 0).toFixed(2)
const day = (d) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—')

export default function Paystub({ run, item, settings, ytd }) {
  const rate = item.hourlyRateCents
  const otRate = item.otHours > 0 ? Math.round(item.otPremiumCents / item.otHours) : 0
  // Persisted stubs store regular + OT hours separately; there is no
  // total_hours column, so derive it (regularHours is defined as hours − OT).
  const totalHours = (Number(item.regularHours) || 0) + (Number(item.otHours) || 0)

  // Base pay covers EVERY hour at straight time (overtime hours included);
  // the overtime row is the extra half-time premium on top. Same total as
  // "regular × rate + OT × 1.5 × rate", shown the way the FLSA computes it.
  const earnings = [
    item.basePayCents > 0 && [
      item.classification === 'contractor' ? 'Contract labor' : 'Straight time (incl. any OT hours)',
      hrs(totalHours), rate ? `${usd(rate)}/h` : '—', usd(item.basePayCents),
    ],
    item.otHours > 0 && ['Overtime premium (½× blended rate)', hrs(item.otHours), usd(otRate), usd(item.otPremiumCents)],
    item.piecePayCents > 0 && ['Per-stop pay', String(item.stops), '', usd(item.piecePayCents)],
    item.makeupPayCents > 0 && ['Minimum-wage makeup', '', '', usd(item.makeupPayCents)],
    item.mileageExcessCents > 0 && ['Mileage above IRS rate (taxable)', String(item.miles), '', usd(item.mileageExcessCents)],
    item.bonusCents > 0 && ['Bonus', '', '', usd(item.bonusCents)],
  ].filter(Boolean)

  const ficaThisPeriod = item.employeeSsCents + item.employeeMedicareCents + item.employeeAddlMedicareCents
  const deductions = [
    ['Federal income tax', usd(item.fedIncomeTaxCents), usd(ytd.fedIncomeTaxCents)],
    ['Social Security (6.2%)', usd(item.employeeSsCents), ''],
    ['Medicare (1.45%)', usd(item.employeeMedicareCents), ''],
    item.employeeAddlMedicareCents > 0 && ['Additional Medicare (0.9%)', usd(item.employeeAddlMedicareCents), ''],
    item.otherDeductionCents > 0 && [item.otherDeductionLabel || 'Other deduction', usd(item.otherDeductionCents), ''],
  ].filter(Boolean)

  return (
    <>
      <Head>
        <title>{`Paystub · ${item.employeeName} · ${run.payDate}`}</title>
        <meta name="robots" content="noindex" />
      </Head>
      <div style={{ maxWidth: 760, margin: '0 auto', padding: 28, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', color: '#111', background: '#fff' }}>

        <div className="noprint" style={{ marginBottom: 20, display: 'flex', gap: 10 }}>
          <button onClick={() => window.print()} style={{ padding: '10px 18px', borderRadius: 8, border: 'none', background: '#1a7f4b', color: '#fff', fontWeight: 800, cursor: 'pointer', fontSize: '0.9rem' }}>
            Print / Save PDF
          </button>
          <button onClick={() => window.history.back()} style={{ padding: '10px 18px', borderRadius: 8, border: '1px solid #ccc', background: '#fff', color: '#444', fontWeight: 700, cursor: 'pointer', fontSize: '0.9rem' }}>
            Back
          </button>
        </div>

        {run.status !== 'finalized' && (
          <div style={{ padding: '10px 14px', borderRadius: 8, background: run.status === 'void' ? '#fdeaea' : '#fff7e6', border: `1px solid ${run.status === 'void' ? '#e3a1a1' : '#e6c67a'}`, color: run.status === 'void' ? '#9c1f1f' : '#8a6100', fontWeight: 800, fontSize: '0.85rem', marginBottom: 20 }}>
            {run.status === 'void'
              ? 'VOIDED — this stub is not payable.'
              : 'DRAFT — not finalized yet. Amounts may still change, and the YTD column counts finalized runs only (so it excludes this one).'}
          </div>
        )}

        <header style={{ display: 'flex', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap', borderBottom: '2px solid #111', paddingBottom: 14, marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: '1.35rem', fontWeight: 900, letterSpacing: '-0.01em' }}>{settings.legalName}</div>
            {settings.address && <div style={{ fontSize: '0.82rem', color: '#555', marginTop: 3 }}>{settings.address}</div>}
            {settings.ein && <div style={{ fontSize: '0.82rem', color: '#555' }}>EIN {settings.ein}</div>}
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#666' }}>Earnings Statement</div>
            <div style={{ fontSize: '0.85rem', marginTop: 4 }}>Pay date <strong>{day(run.payDate)}</strong></div>
            <div style={{ fontSize: '0.85rem' }}>Period {day(run.periodStart)} – {day(run.periodEnd)}</div>
            <div style={{ fontSize: '0.78rem', color: '#666' }}>Run #{run.id}</div>
          </div>
        </header>

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap', marginBottom: 22 }}>
          <div>
            <div style={{ fontSize: '0.7rem', fontWeight: 900, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#666' }}>Employee</div>
            <div style={{ fontSize: '1.05rem', fontWeight: 800, marginTop: 3 }}>{item.employeeName}</div>
            <div style={{ fontSize: '0.82rem', color: '#555' }}>
              {item.classification === 'contractor' ? '1099 contractor (no withholding)' : 'W-2 employee'} · paid {item.payFrequency}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 900, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#666' }}>Net pay</div>
            <div style={{ fontSize: '1.9rem', fontWeight: 900, color: '#1a7f4b', lineHeight: 1.1 }}>{usd(item.netCents)}</div>
          </div>
        </div>

        <Section title="Earnings">
          <Table
            head={['Description', 'Hours / Qty', 'Rate', 'Amount']}
            rows={[
              ...earnings.map((r) => [r[0], r[1], r[2], r[3]]),
              ['Gross taxable wages', hrs(totalHours), '', usd(item.taxableGrossCents)],
            ]}
            boldLast
          />
        </Section>

        <Section title="Deductions & withholding">
          <Table
            head={['Description', 'This period', 'YTD']}
            rows={[
              ...deductions,
              ['Total deductions', usd(item.employeeTaxCents + item.otherDeductionCents), usd(ytd.fedIncomeTaxCents + ytd.employeeFicaCents)],
            ]}
            boldLast
          />
          <div style={{ fontSize: '0.72rem', color: '#888', marginTop: 6 }}>
            FICA is tracked as a year-to-date total rather than per component: {usd(ficaThisPeriod)} this period,
            {' '}{usd(ytd.employeeFicaCents)} year to date.
          </div>
        </Section>

        {(item.reimbursementCents > 0 || item.expenseReimbursementCents > 0) && (
          <Section title="Non-taxable reimbursement">
            <Table
              head={['Description', 'Qty', 'Rate', 'Amount']}
              rows={[
                item.reimbursementCents > 0 && ['Mileage (accountable plan, not wages)', String(item.miles), '', usd(item.reimbursementCents)],
                item.expenseReimbursementCents > 0 && [
                  `Approved receipts (accountable plan, not wages)${
                    item.detail?.expenseClaims?.length
                      ? ` — ${item.detail.expenseClaims.map((c) => `${c.vendor || c.description} ${usd(c.amountCents)}`).join('; ')}`
                      : ''}`,
                  '', '', usd(item.expenseReimbursementCents),
                ],
                (item.reimbursementCents > 0 && item.expenseReimbursementCents > 0) &&
                  ['Total reimbursed', '', '', usd(item.reimbursementCents + item.expenseReimbursementCents)],
              ].filter(Boolean)}
              boldLast={item.reimbursementCents > 0 && item.expenseReimbursementCents > 0}
            />
          </Section>
        )}

        <div style={{ borderTop: '2px solid #111', marginTop: 6, paddingTop: 14, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
          <div style={{ fontSize: '0.82rem', color: '#555', lineHeight: 1.7 }}>
            <div><strong>Gross (incl. reimbursement):</strong> {usd(item.grossCents)}</div>
            <div><strong>YTD gross wages:</strong> {usd(ytd.grossCents)} · <strong>YTD net:</strong> {usd(ytd.netCents)}</div>
            <div style={{ color: '#777' }}>Employer-paid taxes this period: {usd(item.employerTaxCents)} (not deducted from your pay)</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 900, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#666' }}>Net pay</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 900 }}>{usd(item.netCents)}</div>
          </div>
        </div>

        {item.detail?.deductionShortfallCents > 0 && (
          <div style={{ fontSize: '0.8rem', color: '#8a6100', marginTop: 14, fontWeight: 700 }}>
            {usd(item.detail.deductionShortfallCents)} of the requested deduction could not be taken from this
            check without pushing net pay below zero — it was not deducted.
          </div>
        )}

        {item.detail?.withholdingShortfallCents > 0 && (
          <div style={{ fontSize: '0.8rem', color: '#8a6100', marginTop: 14, fontWeight: 700 }}>
            Your W-4 asks for more federal withholding than this check could cover;
            {' '}{usd(item.detail.withholdingShortfallCents)} was not withheld.
          </div>
        )}

        <div style={{ fontSize: '0.72rem', color: '#888', marginTop: 24, lineHeight: 1.6 }}>
          Texas has no state income tax. Overtime is computed per FLSA workweek at 1.5× the blended regular rate.
          Keep this statement for your records.
        </div>

        <style jsx global>{`
          @media print {
            .noprint { display: none !important; }
            body { margin: 0; }
            @page { margin: 14mm; }
          }
        `}</style>
      </div>
    </>
  )
}

function Section({ title, children }) {
  return (
    <section style={{ marginBottom: 22 }}>
      <div style={{ fontSize: '0.7rem', fontWeight: 900, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#666', marginBottom: 8 }}>{title}</div>
      {children}
    </section>
  )
}

function Table({ head, rows, boldLast }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
      <thead>
        <tr>
          {head.map((h, i) => (
            <th key={h} style={{ textAlign: i === 0 ? 'left' : 'right', fontSize: '0.68rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: '#777', padding: '6px 8px', borderBottom: '1px solid #ddd' }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, ri) => {
          const bold = boldLast && ri === rows.length - 1
          return (
            <tr key={ri} style={{ fontWeight: bold ? 800 : 400, background: bold ? '#f6f6f6' : 'transparent' }}>
              {r.map((c, ci) => (
                <td key={ci} style={{ textAlign: ci === 0 ? 'left' : 'right', padding: '7px 8px', borderBottom: '1px solid #eee' }}>{c}</td>
              ))}
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

// Federal filing rollups + pre-filled Form 941. Owner only.
//   GET /api/admin/payroll-filings?year=2026            → JSON: deposits, 941 quarters, 940, W-2 boxes
//   GET /api/admin/payroll-filings?year=2026&form941=3  → the official Form 941 PDF, pre-filled for Q3
// Numbers come from FINALIZED runs only — a draft run files nothing.
import { requireOwner } from '../../../lib/auth'
import { listFinalizedItemRows, getSettings } from '../../../lib/payroll-store'
import { aggregate941, aggregate940, aggregateW2, depositSchedule } from '../../../lib/payroll-filings'
import { fill941Pdf } from '../../../lib/payroll-941-pdf'

export default async function handler(req, res) {
  const session = await requireOwner(req, res)
  if (!session) return
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  res.setHeader('Cache-Control', 'no-store')

  try {
    const year = Number(req.query.year) || new Date().getFullYear()
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      return res.status(400).json({ error: 'year must be a 4-digit year' })
    }
    const [rows, settings] = await Promise.all([listFinalizedItemRows({ year }), getSettings()])

    if (req.query.form941 !== undefined) {
      const quarter = Number(req.query.form941)
      if (![1, 2, 3, 4].includes(quarter)) return res.status(400).json({ error: 'form941 must be 1-4' })
      const agg = aggregate941({ rows, year, quarter })
      if (!agg.hasActivity) return res.status(404).json({ error: `No finalized payroll in Q${quarter} ${year}` })
      const pdf = await fill941Pdf({
        agg,
        settings,
        // Print-name is left for the owner to type when signing; the phone
        // matches the business number on /admin/invoice-pdf.
        signer: { name: '', title: 'Owner', phone: '512-560-4129' },
      })
      res.setHeader('Content-Type', 'application/pdf')
      res.setHeader('Content-Disposition', `attachment; filename="form941_${year}_Q${quarter}.pdf"`)
      return res.status(200).send(pdf)
    }

    return res.json({
      year,
      settings: { legalName: settings.legalName, ein: settings.ein, address: settings.address, twcAccount: settings.twcAccount },
      deposits: depositSchedule({ rows, year }),
      quarters: [1, 2, 3, 4].map((q) => aggregate941({ rows, year, quarter: q })),
      form940: aggregate940({ rows, year }),
      w2: aggregateW2({ rows, year }),
    })
  } catch (err) {
    const status = err?.status || 500
    if (status >= 500) {
      console.error('[payroll-filings]', err)
      return res.status(500).json({ error: 'Server error' })
    }
    return res.status(status).json({ error: err.message })
  }
}

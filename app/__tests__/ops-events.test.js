/**
 * Tests for /lib/ops-events.js
 *
 * The automation event log: the first-party record of what the automation did,
 * written by whichever path actually did the work. Covers the closed kind set,
 * the never-throw contract (a log failure must never break the automation it is
 * logging), idempotency, and the since-normalization the proof endpoint relies
 * on.
 */

const mockQ = jest.fn()
jest.mock('../lib/db', () => ({
  q: (...args) => mockQ(...args),
}))

const {
  recordEvent,
  countEventsSince,
  countAllEventsSince,
  currentBusinessId,
  KINDS,
} = require('../lib/ops-events')

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  jest.restoreAllMocks()
})

describe('recordEvent', () => {
  test('inserts a row and reports true when one was written', async () => {
    mockQ.mockResolvedValue({ rowCount: 1, rows: [{ id: '7' }] })
    const ok = await recordEvent({
      kind: KINDS.REMINDER_SENT,
      subjectRef: 'evt_1',
      details: { channel: 'resend' },
    })
    expect(ok).toBe(true)
    const [sql, params] = mockQ.mock.calls[0]
    expect(sql).toMatch(/INSERT INTO ops_events/)
    expect(params[0]).toBe('reminder_sent')
    expect(params[3]).toBe('evt_1')
    // details is serialized, not passed as a raw object
    expect(params[4]).toBe('{"channel":"resend"}')
  })

  test('reports false when the insert was a duplicate (ON CONFLICT DO NOTHING)', async () => {
    mockQ.mockResolvedValue({ rowCount: 0, rows: [] })
    const ok = await recordEvent({ kind: KINDS.REMINDER_SENT, subjectRef: 'evt_1' })
    expect(ok).toBe(false)
  })

  // The ON CONFLICT target must match the partial unique index created by
  // scripts/migrate-ops-events-tenant.js exactly. If they drift, Postgres
  // rejects the statement outright and every write fails.
  test('dedups on (business_id, kind, subject_ref), so two tenants can share a subject_ref', async () => {
    mockQ.mockResolvedValue({ rowCount: 1, rows: [{ id: '1' }] })
    await recordEvent({ kind: KINDS.ROUTE_EMAILED, subjectRef: null })
    const [sql, params] = mockQ.mock.calls[0]
    expect(sql).toMatch(
      /ON CONFLICT \(business_id, kind, subject_ref\) WHERE subject_ref IS NOT NULL DO NOTHING/
    )
    expect(params[3]).toBeNull()
  })

  // The collision this whole change exists to prevent: the route job keys on the
  // day label alone, so before the tenant was in the key, the second business to
  // email a route on 'Mon Sep 22' had its event dropped as a duplicate.
  test('writes the tenant it is given, so a shared day-label subject_ref is per-tenant', async () => {
    mockQ.mockResolvedValue({ rowCount: 1, rows: [{ id: '1' }] })
    await recordEvent({ kind: KINDS.ROUTE_EMAILED, subjectRef: 'Mon Sep 22', businessId: 'lawnpro' })
    expect(mockQ.mock.calls[0][1][1]).toBe('lawnpro')
    expect(mockQ.mock.calls[0][1][3]).toBe('Mon Sep 22')
  })

  test('refuses an unknown kind rather than writing an uncountable row', async () => {
    const ok = await recordEvent({ kind: 'reminder_snet', subjectRef: 'evt_1' })
    expect(ok).toBe(false)
    expect(mockQ).not.toHaveBeenCalled()
  })

  // The contract that matters most: logging must never break the automation.
  test('never throws when the database is down', async () => {
    mockQ.mockRejectedValue(new Error('ECONNREFUSED'))
    await expect(
      recordEvent({ kind: KINDS.FOLLOWUP_SENT, subjectRef: 'evt_2' })
    ).resolves.toBe(false)
  })

  test('rejects an unparseable occurredAt instead of writing a garbage timestamp', async () => {
    const ok = await recordEvent({
      kind: KINDS.PAYROLL_RUN,
      subjectRef: 'run_1',
      occurredAt: 'not-a-date',
    })
    expect(ok).toBe(false)
    expect(mockQ).not.toHaveBeenCalled()
  })

  test('defaults business_id to the configured tenant when none is passed', async () => {
    mockQ.mockResolvedValue({ rowCount: 1, rows: [{ id: '1' }] })
    await recordEvent({ kind: KINDS.INVOICE_PAID, subjectRef: 'in_1' })
    expect(mockQ.mock.calls[0][1][1]).toBe(currentBusinessId())
    expect(currentBusinessId()).toBe('greenguard')
  })

  // Enforced, not defaulted. A caller that threads a tenant through and hands
  // over undefined has a bug, and silently filing the row under the default
  // tenant would put one business's automation into another's counts. Refusing
  // the row is the safer failure.
  test.each([
    ['an empty string', ''],
    ['whitespace', '   '],
    ['a non-string', 42],
  ])('refuses to write when businessId is %s', async (_label, bad) => {
    const ok = await recordEvent({ kind: KINDS.INVOICE_PAID, subjectRef: 'in_1', businessId: bad })
    expect(ok).toBe(false)
    expect(mockQ).not.toHaveBeenCalled()
  })

  test('trims a padded businessId rather than writing the padding', async () => {
    mockQ.mockResolvedValue({ rowCount: 1, rows: [{ id: '1' }] })
    await recordEvent({ kind: KINDS.INVOICE_PAID, subjectRef: 'in_1', businessId: ' poolpro ' })
    expect(mockQ.mock.calls[0][1][1]).toBe('poolpro')
  })
})

describe('countEventsSince', () => {
  test('returns the count for a kind', async () => {
    mockQ.mockResolvedValue({ rows: [{ n: 12 }] })
    await expect(countEventsSince(KINDS.REMINDER_SENT, new Date())).resolves.toBe(12)
  })

  test('returns undefined (not zero) when the query fails, so callers can fall back', async () => {
    mockQ.mockRejectedValue(new Error('db down'))
    await expect(countEventsSince(KINDS.REMINDER_SENT, new Date())).resolves.toBeUndefined()
  })

  test('returns undefined for an unknown kind', async () => {
    await expect(countEventsSince('nope', new Date())).resolves.toBeUndefined()
    expect(mockQ).not.toHaveBeenCalled()
  })

  // The proof endpoint works in UNIX seconds; passing those straight through as
  // milliseconds would silently widen the window to 1970.
  test('accepts UNIX seconds and converts them, not treating them as milliseconds', async () => {
    mockQ.mockResolvedValue({ rows: [{ n: 1 }] })
    const sinceSec = Math.floor(Date.parse('2026-09-15T00:00:00Z') / 1000)
    await countEventsSince(KINDS.REMINDER_SENT, sinceSec)
    expect(mockQ.mock.calls[0][1][2]).toBe('2026-09-15T00:00:00.000Z')
  })

  test('scopes the count to the tenant it is given', async () => {
    mockQ.mockResolvedValue({ rows: [{ n: 4 }] })
    await countEventsSince(KINDS.REMINDER_SENT, new Date(), { businessId: 'lawnpro' })
    const [sql, params] = mockQ.mock.calls[0]
    expect(sql).toMatch(/business_id = \$1/)
    expect(params[0]).toBe('lawnpro')
  })

  test('defaults the tenant to the configured one', async () => {
    mockQ.mockResolvedValue({ rows: [{ n: 4 }] })
    await countEventsSince(KINDS.REMINDER_SENT, new Date())
    expect(mockQ.mock.calls[0][1][0]).toBe(currentBusinessId())
  })

  test('returns undefined for an invalid businessId instead of counting the default tenant', async () => {
    await expect(
      countEventsSince(KINDS.REMINDER_SENT, new Date(), { businessId: '' })
    ).resolves.toBeUndefined()
    expect(mockQ).not.toHaveBeenCalled()
  })

  test('accepts milliseconds and an ISO string', async () => {
    mockQ.mockResolvedValue({ rows: [{ n: 1 }] })
    await countEventsSince(KINDS.REMINDER_SENT, Date.parse('2026-09-15T00:00:00Z'))
    expect(mockQ.mock.calls[0][1][2]).toBe('2026-09-15T00:00:00.000Z')

    mockQ.mockClear()
    await countEventsSince(KINDS.REMINDER_SENT, '2026-09-15T00:00:00Z')
    expect(mockQ.mock.calls[0][1][2]).toBe('2026-09-15T00:00:00.000Z')
  })
})

describe('countAllEventsSince', () => {
  test('groups counts by kind in a single query', async () => {
    mockQ.mockResolvedValue({
      rows: [
        { kind: 'reminder_sent', n: 9 },
        { kind: 'route_emailed', n: 5 },
      ],
    })
    await expect(countAllEventsSince(new Date())).resolves.toEqual({
      reminder_sent: 9,
      route_emailed: 5,
    })
    expect(mockQ).toHaveBeenCalledTimes(1)
  })

  // An empty object is the signal that means "table reachable, nothing in the
  // window", which is what must trigger the Gmail fallback. undefined means
  // "could not read at all". They are deliberately different values.
  test('returns an empty object when the window has no rows', async () => {
    mockQ.mockResolvedValue({ rows: [] })
    await expect(countAllEventsSince(new Date())).resolves.toEqual({})
  })

  test('returns undefined when the query fails', async () => {
    mockQ.mockRejectedValue(new Error('db down'))
    await expect(countAllEventsSince(new Date())).resolves.toBeUndefined()
  })

  test('ignores kinds outside the known set', async () => {
    mockQ.mockResolvedValue({ rows: [{ kind: 'mystery_kind', n: 3 }] })
    await expect(countAllEventsSince(new Date())).resolves.toEqual({})
  })

  test('scopes the grouped count to the tenant it is given', async () => {
    mockQ.mockResolvedValue({ rows: [] })
    await countAllEventsSince(new Date(), { businessId: 'poolpro' })
    const [sql, params] = mockQ.mock.calls[0]
    expect(sql).toMatch(/business_id = \$1/)
    expect(params[0]).toBe('poolpro')
  })

  test('defaults the tenant to the configured one', async () => {
    mockQ.mockResolvedValue({ rows: [] })
    await countAllEventsSince(new Date())
    expect(mockQ.mock.calls[0][1][0]).toBe(currentBusinessId())
  })

  // null means "use the configured tenant" and is allowed. Only a present but
  // unusable value is refused.
  test('treats an explicit null businessId as the configured tenant', async () => {
    mockQ.mockResolvedValue({ rows: [] })
    await expect(countAllEventsSince(new Date(), { businessId: null })).resolves.toEqual({})
    expect(mockQ.mock.calls[0][1][0]).toBe(currentBusinessId())
  })

  test('returns undefined for a blank businessId', async () => {
    await expect(countAllEventsSince(new Date(), { businessId: '  ' })).resolves.toBeUndefined()
    expect(mockQ).not.toHaveBeenCalled()
  })
})

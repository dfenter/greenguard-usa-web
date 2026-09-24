// lib/sparkbridge-store against a mocked pg: SQL shape, pair matching, supersede transaction.
const calls = []
const client = { query: jest.fn(async (text, params) => { calls.push(['client', text, params]); return { rows: [{ id: 9 }], rowCount: 1 } }), release: jest.fn() }
const mockQ = { impl: async (text, params) => { calls.push(['q', text, params]); return { rows: [], rowCount: 1 } } }
jest.mock('../lib/db', () => ({
  q: (...a) => mockQ.impl(...a),
  getPool: () => ({ connect: async () => client }),
}))
const S = require('../lib/sparkbridge-store')

describe('sparkbridge-store SQL', () => {
  test('grants are idempotent on session_id, matching is on the lowercased pair, keys supersede in a transaction', async () => {
        await S.recordGrant({ email: ' Buyer@Acme.com ', gateway: ' Ignition-Gateway ', licensee: 'Acme', sku: 'sparks7', entitlements: ['x'], supportUntil: '2027-09-01', sessionId: 'cs_1' })
        const ins = calls.find((c) => /INSERT INTO sparkbridge_grants/.test(c[1]))
        expect(ins[1]).toMatch(/ON CONFLICT \(session_id\) DO NOTHING/)
        expect(ins[2].slice(0, 3)).toEqual(['buyer@acme.com', 'ignition-gateway', 'Ignition-Gateway'])
        await S.activeGrants('Buyer@Acme.com', 'IGNITION-gateway')
        const sel = calls.find((c) => /FROM sparkbridge_grants/.test(c[1]))
        expect(sel[1]).toMatch(/WHERE email = \$1 AND gateway_id = \$2 AND/)
        expect(sel[2]).toEqual(['buyer@acme.com', 'ignition-gateway'])
        const id = await S.recordIssuedKey({ email: 'Buyer@Acme.com', gateway: 'Ignition-Gateway', entitlements: ['x'], keySha256: 'h', reason: 'purchase' })
        expect(id).toBe(9)
        const seq = calls.filter((c) => c[0] === 'client').map((c) => c[1].trim().split(/\s+/)[0])
        expect(seq).toEqual(['BEGIN', 'INSERT', 'UPDATE', 'COMMIT'])
        const upd = calls.find((c) => c[0] === 'client' && /^\s*UPDATE/.test(c[1]))
        expect(upd[1]).toMatch(/superseded_by = \$3/)
        expect(upd[2]).toEqual(['buyer@acme.com', 'ignition-gateway', 9])
        expect(client.release).toHaveBeenCalled()
        expect(calls.filter((c) => /CREATE TABLE IF NOT EXISTS sparkbridge_grants/.test(c[1]))).toHaveLength(1)
  })

  test('DDL indexes both tables on (email, gateway_id)', () => {
    const idx = S.DDL.filter((d) => /CREATE INDEX/.test(d.sql)).map((d) => d.sql)
    expect(idx.some((x) => /ON sparkbridge_grants \(email, gateway_id\)/.test(x))).toBe(true)
    expect(idx.some((x) => /ON sparkbridge_keys \(email, gateway_id\)/.test(x))).toBe(true)
  })

  test('ensureSchema tolerates concurrent-create races (42P07, 23505) in a fresh process', async () => {
    await jest.isolateModulesAsync(async () => {
      const seen = []
      mockQ.impl = async (text) => {
        seen.push(text)
        if (/CREATE TABLE IF NOT EXISTS sparkbridge_grants/.test(text)) throw Object.assign(new Error('exists'), { code: '42P07' })
        if (/sparkbridge_keys_pair/.test(text)) throw Object.assign(new Error('dup'), { code: '23505' })
        return { rows: [], rowCount: 0 }
      }
      const S2 = require('../lib/sparkbridge-store')
      await expect(S2.ensureSchema()).resolves.toBeUndefined()
      expect(seen).toHaveLength(4)
    })
  })

  test('other schema errors propagate and are retried on the next call', async () => {
    await jest.isolateModulesAsync(async () => {
      let fail = true
      mockQ.impl = async () => { if (fail) throw Object.assign(new Error('perm'), { code: '42501' }); return { rows: [], rowCount: 0 } }
      const S2 = require('../lib/sparkbridge-store')
      await expect(S2.ensureSchema()).rejects.toThrow(/perm/)
      fail = false
      await expect(S2.ensureSchema()).resolves.toBeUndefined()
    })
  })
})

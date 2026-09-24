// lib/sparkbridge-store against a mocked pg: SQL shape, pair matching, supersede transaction.
const calls = []
const client = { query: jest.fn(async (text, params) => { calls.push(['client', text, params]); return { rows: [{ id: 9 }], rowCount: 1 } }), release: jest.fn() }
jest.mock('../lib/db', () => ({
  q: jest.fn(async (text, params) => { calls.push(['q', text, params]); return { rows: [], rowCount: 1 } }),
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
        expect(sel[1]).toMatch(/lower\(email\) = \$1 AND lower\(gateway_id\) = \$2/)
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
})

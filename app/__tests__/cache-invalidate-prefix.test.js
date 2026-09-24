const mockStore = new Map()
let mockScanSnapshot = []
const mockRedis = {
  get: jest.fn(async (k) => (mockStore.has(k) ? mockStore.get(k) : null)),
  set: jest.fn(async (k, v) => { mockStore.set(k, v) }),
  del: jest.fn(async (k) => { mockStore.delete(k) }),
  // Two-page SCAN (snapshot on the first call) so the cursor loop is exercised.
  scan: jest.fn(async (cursor, { match }) => {
    if (cursor === '0') {
      const prefix = match.replace(/\*$/, '')
      mockScanSnapshot = [...mockStore.keys()].filter((k) => k.startsWith(prefix))
    }
    const half = Math.ceil(mockScanSnapshot.length / 2)
    return cursor === '0' ? ['7', mockScanSnapshot.slice(0, half)] : ['0', mockScanSnapshot.slice(half)]
  }),
}
jest.mock('@upstash/redis', () => ({ Redis: jest.fn(() => mockRedis) }))

process.env.UPSTASH_REDIS_REST_URL = 'https://example.upstash.io'
process.env.UPSTASH_REDIS_REST_TOKEN = 'token'

const { cached, invalidatePrefix } = require('../lib/cache')

describe('invalidatePrefix', () => {
  beforeEach(() => { mockStore.clear(); jest.clearAllMocks() })

  test('drops matching keys from both tiers and keeps the rest', async () => {
    const keys = ['gcal:bookings:v2:range:2026-09-01:2026-09-07', 'gcal:bookings:v2:range:2026-09-08:2026-09-14', 'gcal:bookings:v2:date:2026-09-01', 'other:key']
    for (const k of keys) await cached(k, 60, async () => `v:${k}`)
    expect(mockStore.size).toBe(4)

    await invalidatePrefix('gcal:bookings:v2:range:')

    expect([...mockStore.keys()].sort()).toEqual(['gcal:bookings:v2:date:2026-09-01', 'other:key'])
    expect(mockRedis.scan).toHaveBeenCalledTimes(2)
    expect(mockRedis.del).toHaveBeenCalledTimes(2)

    // Mem tier: prefixed keys refetch, others still served from memory.
    const refetch = jest.fn(async () => 'fresh')
    expect(await cached(keys[0], 60, refetch)).toBe('fresh')
    expect(refetch).toHaveBeenCalledTimes(1)
    const untouched = jest.fn(async () => 'fresh')
    expect(await cached('other:key', 60, untouched)).toBe('v:other:key')
    expect(untouched).not.toHaveBeenCalled()
  })

  test('no matching keys deletes nothing', async () => {
    mockStore.set('other:key', 'x')
    await invalidatePrefix('gcal:bookings:v2:range:')
    expect(mockRedis.del).not.toHaveBeenCalled()
    expect(mockStore.has('other:key')).toBe(true)
  })

  test('redis scan failure is swallowed', async () => {
    mockRedis.scan.mockRejectedValueOnce(new Error('down'))
    await expect(invalidatePrefix('x:')).resolves.toBeUndefined()
  })
})

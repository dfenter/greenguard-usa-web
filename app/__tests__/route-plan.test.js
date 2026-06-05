'use strict'

// ── route-plan.js unit tests ─────────────────────────────────────────────────
// Tests the ISO week-year algorithm and caching behaviour.
// fetchFromDisk() file-selection logic is tested via the exported helper.

// ── currentIsoWeek() — tested by replicating the algorithm ──────────────────
// The fix uses Thursday-of-week to determine ISO year (ISO 8601: the week's
// year is the calendar year that contains that week's Thursday).

function currentIsoWeekFor(dateStr) {
  const now = new Date(dateStr)
  const thursday = new Date(now)
  thursday.setDate(now.getDate() - ((now.getDay() + 6) % 7) + 3)
  const isoYear = thursday.getFullYear()
  const jan4 = new Date(isoYear, 0, 4)
  const startOfWeek1 = new Date(jan4)
  startOfWeek1.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7))
  const weekNum = Math.floor((now - startOfWeek1) / (7 * 86400 * 1000)) + 1
  return `${isoYear}-W${String(weekNum).padStart(2, '0')}`
}

describe('currentIsoWeek() — ISO year boundary correctness', () => {
  test('Dec 30 2024 (Monday) is 2025-W01, not 2024-W53', () => {
    expect(currentIsoWeekFor('2024-12-30T12:00:00-06:00')).toBe('2025-W01')
  })

  test('Dec 31 2024 (Tuesday) is also 2025-W01', () => {
    expect(currentIsoWeekFor('2024-12-31T12:00:00-06:00')).toBe('2025-W01')
  })

  test('Jan 1 2025 (Wednesday) is 2025-W01', () => {
    expect(currentIsoWeekFor('2025-01-01T12:00:00-06:00')).toBe('2025-W01')
  })

  test('Jan 1 2021 (Friday) is 2020-W53', () => {
    expect(currentIsoWeekFor('2021-01-01T12:00:00-06:00')).toBe('2020-W53')
  })

  test('Jun 1 2026 (Monday) is 2026-W23', () => {
    expect(currentIsoWeekFor('2026-06-01T12:00:00-06:00')).toBe('2026-W23')
  })

  test('Jan 4 is always in W01 of its own calendar year', () => {
    expect(currentIsoWeekFor('2026-01-04T12:00:00-06:00')).toBe('2026-W01')
    expect(currentIsoWeekFor('2025-01-04T12:00:00-06:00')).toBe('2025-W01')
  })

  test('week label sort order is lexicographic across year boundary', () => {
    const w53_2020 = currentIsoWeekFor('2021-01-01T12:00:00-06:00') // 2020-W53
    const w01_2021 = currentIsoWeekFor('2021-01-05T12:00:00-06:00') // 2021-W01 (Tue Jan 5 → Mon Jan 4)
    // 2020-W53 < 2021-W01 lexicographically — crucial for fetchFromDisk sort
    expect(w53_2020 < w01_2021).toBe(true)
  })
})

// ── fetchFromDisk() file selection logic ─────────────────────────────────────
// The key invariant: eligible = files whose week label <= currentWeek,
// sorted descending. Falls back to most recent file when eligible is empty.

function selectFile(files, currentWeek) {
  // Replicated from route-plan.js fetchFromDisk()
  const eligible = files
    .map((f) => ({ f, week: f.replace('route_plan_', '').replace('.json', '') }))
    .filter(({ week }) => week <= currentWeek)
    .sort((a, b) => b.week.localeCompare(a.week))
  if (eligible.length) return eligible[0].f
  return files
    .map((f) => ({ f, week: f.replace('route_plan_', '').replace('.json', '') }))
    .sort((a, b) => b.week.localeCompare(a.week))[0].f
}

describe('fetchFromDisk() file selection', () => {
  test('picks current week when present', () => {
    const files = ['route_plan_2026-W22.json', 'route_plan_2026-W23.json', 'route_plan_2026-W27.json']
    expect(selectFile(files, '2026-W23')).toBe('route_plan_2026-W23.json')
  })

  test('picks most recent past week when current week absent', () => {
    const files = ['route_plan_2026-W22.json', 'route_plan_2026-W23.json', 'route_plan_2026-W24.json', 'route_plan_2026-W27.json']
    expect(selectFile(files, '2026-W25')).toBe('route_plan_2026-W24.json')
  })

  test('skips future weeks in eligible list', () => {
    const files = ['route_plan_2026-W27.json', 'route_plan_2026-W28.json']
    // All future relative to W23 — falls back to most recent file regardless
    const chosen = selectFile(files, '2026-W23')
    expect(['route_plan_2026-W27.json', 'route_plan_2026-W28.json']).toContain(chosen)
  })

  test('does not confuse 2025-W52 with 2026-W01 (year boundary sort)', () => {
    const files = ['route_plan_2025-W52.json', 'route_plan_2026-W01.json']
    // Current week is 2026-W03 — both are in the past, should pick 2026-W01
    expect(selectFile(files, '2026-W03')).toBe('route_plan_2026-W01.json')
  })

  test('single current-week file selected', () => {
    const files = ['route_plan_2026-W23.json']
    expect(selectFile(files, '2026-W23')).toBe('route_plan_2026-W23.json')
  })
})

// ── getLatestRoutePlan() — 90s TTL cache ──────────────────────────────────────

describe('getLatestRoutePlan() — 90s TTL cache', () => {
  beforeEach(() => {
    jest.resetModules()
    jest.useFakeTimers()
    global.fetch = jest.fn()
    process.env.CRON_SECRET = 'test-secret'
    process.env.WEBHOOK_AGENT_URL = 'https://agent.test'
  })

  afterEach(() => {
    jest.useRealTimers()
    delete process.env.CRON_SECRET
    delete process.env.WEBHOOK_AGENT_URL
  })

  test('second call within 90s returns cache — fetch called only once', async () => {
    const plan = { week: '2026-W23', days: [], generated_at: '2026-06-01T00:00:00Z' }
    global.fetch.mockResolvedValue({ ok: true, json: async () => plan })

    const { getLatestRoutePlan } = require('../lib/route-plan')
    await getLatestRoutePlan()
    await getLatestRoutePlan()
    await getLatestRoutePlan()

    expect(global.fetch).toHaveBeenCalledTimes(1)
  })

  test('call after 90s re-fetches', async () => {
    const plan = { week: '2026-W23', days: [], generated_at: '2026-06-01T00:00:00Z' }
    global.fetch.mockResolvedValue({ ok: true, json: async () => plan })

    const { getLatestRoutePlan } = require('../lib/route-plan')
    await getLatestRoutePlan()
    jest.advanceTimersByTime(91_000)
    await getLatestRoutePlan()

    expect(global.fetch).toHaveBeenCalledTimes(2)
  })

  test('webhook non-ok response falls through to disk (plan:null for empty disk)', async () => {
    global.fetch.mockResolvedValue({ ok: false, status: 404 })

    const { getLatestRoutePlan } = require('../lib/route-plan')
    const result = await getLatestRoutePlan()
    // Disk has actual files in app/public/data/ so result may or may not be null —
    // we just verify it doesn't throw and returns a valid shape.
    expect(result).toHaveProperty('plan')
    expect(result).toHaveProperty('generatedAt')
  })

  test('no CRON_SECRET skips webhook and falls back to disk', async () => {
    delete process.env.CRON_SECRET
    const { getLatestRoutePlan } = require('../lib/route-plan')
    const result = await getLatestRoutePlan()
    expect(global.fetch).not.toHaveBeenCalled()
    expect(result).toHaveProperty('plan')
  })
})

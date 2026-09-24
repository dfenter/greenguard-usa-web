const { ctWallTimeToUTC, dayViewDropMinutes } = require('../lib/calendar-time')

describe('ctWallTimeToUTC', () => {
  test('normal CDT date', () => {
    expect(ctWallTimeToUTC('2026-07-15', 10, 30).toISOString()).toBe('2026-07-15T15:30:00.000Z')
  })
  test('normal CST date', () => {
    expect(ctWallTimeToUTC('2026-01-15', 10, 0).toISOString()).toBe('2026-01-15T16:00:00.000Z')
  })
  test('March DST changeover day (spring forward 2026-03-08)', () => {
    expect(ctWallTimeToUTC('2026-03-07', 10, 0).toISOString()).toBe('2026-03-07T16:00:00.000Z')
    expect(ctWallTimeToUTC('2026-03-08', 10, 0).toISOString()).toBe('2026-03-08T15:00:00.000Z')
    expect(ctWallTimeToUTC('2026-03-09', 10, 0).toISOString()).toBe('2026-03-09T15:00:00.000Z')
  })
  test('November DST changeover day (fall back 2026-11-01)', () => {
    expect(ctWallTimeToUTC('2026-10-31', 10, 0).toISOString()).toBe('2026-10-31T15:00:00.000Z')
    expect(ctWallTimeToUTC('2026-11-01', 10, 0).toISOString()).toBe('2026-11-01T16:00:00.000Z')
    expect(ctWallTimeToUTC('2026-11-02', 14, 30).toISOString()).toBe('2026-11-02T20:30:00.000Z')
  })
})

describe('dayViewDropMinutes', () => {
  const PX = 1.4
  const drop = (startMin, dy) => dayViewDropMinutes(startMin, dy, PX, 8, 19)

  test('no movement or a small nudge is a same-slot drop', () => {
    expect(drop(600, 0)).toBeNull()
    expect(drop(600, 10)).toBeNull()
    expect(drop(600, -20)).toBeNull()
  })
  test('moves in 30-minute steps from the event start', () => {
    expect(drop(600, 30 * PX)).toBe(630)
    expect(drop(600, 60 * PX + 5)).toBe(660)
    expect(drop(600, -90 * PX)).toBe(510)
  })
  test('a tall event nudged just under half a step stays put', () => {
    expect(drop(600, 14 * PX)).toBeNull()
    expect(drop(600, 16 * PX)).toBe(630)
  })
  test('off-boundary start snaps to a 30-minute boundary', () => {
    expect(drop(615, 30 * PX)).toBe(660)
  })
  test('clamps to the visible grid', () => {
    expect(drop(600, -1000)).toBe(480)
    expect(drop(1080, 1000)).toBe(1110)
  })
})

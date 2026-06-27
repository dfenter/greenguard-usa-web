import { TankCalendar } from 'greenguard-portal'

const TODAY = '2026-06-18'

// Baseline — empty calendar, no deliveries or visits scheduled
export function EmptyCalendar() {
  return (
    <div style={{ padding: 16, maxWidth: 480 }}>
      <TankCalendar today={TODAY} currentStock={14} expectedDelivery={6} />
    </div>
  )
}

// Scheduled — deliveries on Wednesdays, visits spread across week
export function WithSchedule() {
  const scheduleByDate = {
    '2026-06-18': { tanks: 1, appts: 2 },
    '2026-06-19': { tanks: 2, appts: 3 },
    '2026-06-22': { tanks: 0, appts: 1 },
    '2026-06-23': { tanks: 1, appts: 2 },
    '2026-06-24': { tanks: 3, appts: 4 }, // Wednesday delivery
    '2026-06-25': { tanks: 2, appts: 3 },
    '2026-06-26': { tanks: 1, appts: 2 },
  }
  const tankCalendar = {
    '2026-06-16': { delivered: 6, tech: 'Dan' },
    '2026-06-17': { delivered: 0, visits: 3 },
  }
  return (
    <div style={{ padding: 16, maxWidth: 480 }}>
      <TankCalendar
        today={TODAY}
        currentStock={8}
        expectedDelivery={6}
        tankCalendar={tankCalendar}
        scheduleByDate={scheduleByDate}
      />
    </div>
  )
}

// Deficit alert — heavy usage burns through stock before next delivery
export function WithDeficit() {
  const scheduleByDate = {
    '2026-06-18': { tanks: 3, appts: 5 },
    '2026-06-19': { tanks: 3, appts: 5 },
    '2026-06-20': { tanks: 3, appts: 4 },
    '2026-06-23': { tanks: 3, appts: 5 },
    '2026-06-24': { tanks: 3, appts: 5 },
    '2026-06-25': { tanks: 2, appts: 3 },
  }
  return (
    <div style={{ padding: 16, maxWidth: 480 }}>
      <TankCalendar
        today={TODAY}
        currentStock={4}
        expectedDelivery={6}
        scheduleByDate={scheduleByDate}
      />
    </div>
  )
}

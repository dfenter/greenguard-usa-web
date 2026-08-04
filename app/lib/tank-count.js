// Canonical per-booking tank count, shared by every surface that shows tank
// demand (home/tech KPIs, tank calendar, /admin/calendar, rounds, route).
// HubSpot tank_count is preferred; when the customer has no HubSpot count
// (or no email on the GCal event), the Google Calendar event title is the
// reference — a "CO2 Tank Exchange" appointment always demands at least one
// tank even if HubSpot doesn't know the customer yet.

// Extract a tank count from event titles like "One - 20 pound CO2 Tank Exchange"
// or "CO2 Tank Exchange - 4 Tanks". Returns null if not a tank exchange.
//
// Word form is checked BEFORE digit form because Cal.com titles like
// "One - 20 pound CO2 Tank Exchange" contain a digit ("20") that refers to
// the tank weight, not the count — matching the digit form first gave us 20.
function tankCountFromTitle(title) {
  if (!title) return null
  const t = title.toLowerCase()
  if (!/tank.*exchange|exchange.*tank|tank.*refill/.test(t)) return null

  // Word form first: "Two -20 pound...", "Ten Tank Service"
  const words = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 }
  for (const [w, n] of Object.entries(words)) {
    if (new RegExp(`\\b${w}\\b.*tank`).test(t)) return n
  }
  // Digit form: must be adjacent to "tank", not separated by "pound" etc.
  // Also require a space or string-start BEFORE the digit so we don't grab
  // the 2 out of "co2 tank" (which was matching "2 tank" as 2 tanks).
  const dm = t.match(/(?:^|\s)(\d+)\s*(?:-|−)?\s*(?:co2\s*)?tanks?\b/)
  if (dm) return parseInt(dm[1], 10)
  return 1
}

// Canonical count for one booking: HubSpot tank_count when the customer has
// one, otherwise the GCal title. Returns null when neither knows.
function bookingTanks(hubspotTanks, title) {
  if (hubspotTanks > 0) return hubspotTanks
  return tankCountFromTitle(title)
}

module.exports = { tankCountFromTitle, bookingTanks }

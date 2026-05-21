const BASE = `${(process.env.CALCOM_BASE_URL || 'https://cal.com').replace(/\/$/, '')}/api/v1`

async function calFetch(path, options = {}) {
  const url = `${BASE}${path}${path.includes('?') ? '&' : '?'}apiKey=${process.env.CALCOM_API_KEY}`
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Cal.com API error ${res.status}: ${text}`)
  }
  return res.json()
}

/**
 * Fetch bookings for a given email within a date range.
 * @param {string} email
 * @param {string} [afterDate] ISO date string
 * @returns {Promise<object[]>}
 */
async function getBookingsForEmail(email, afterDate) {
  const params = new URLSearchParams({ attendeeEmail: email })
  if (afterDate) params.set('afterStart', afterDate)
  const data = await calFetch(`/bookings?${params}`)
  return data.bookings || []
}

/**
 * Fetch all bookings for a given week (used by route optimizer).
 * @param {string} startDate ISO date string (Monday)
 * @param {string} endDate ISO date string (Saturday)
 * @returns {Promise<object[]>}
 */
async function getBookingsForWeek(startDate, endDate) {
  const params = new URLSearchParams({ afterStart: startDate, beforeEnd: endDate })
  const data = await calFetch(`/bookings?${params}`)
  return data.bookings || []
}

/**
 * Reschedule a booking to a new time (requires Cal.com API support).
 * @param {number} bookingId
 * @param {string} newStartTime ISO datetime string
 */
async function rescheduleBooking(bookingId, newStartTime) {
  return calFetch(`/bookings/${bookingId}`, {
    method: 'PATCH',
    body: JSON.stringify({ startTime: newStartTime }),
  })
}

module.exports = { getBookingsForEmail, getBookingsForWeek, rescheduleBooking }

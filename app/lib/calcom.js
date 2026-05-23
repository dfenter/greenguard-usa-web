// Cal.com v1 was decommissioned — all calls now use v2 with Bearer auth
const BASE_V2 = 'https://api.cal.com/v2'
const CAL_VERSION = '2024-06-14'

function headers() {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${process.env.CALCOM_API_KEY}`,
    'cal-api-version': CAL_VERSION,
  }
}

async function calFetch(path, options = {}) {
  const url = `${BASE_V2}${path}`
  const res = await fetch(url, { headers: headers(), ...options })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Cal.com API error ${res.status}: ${text.slice(0, 300)}`)
  }
  return res.json()
}

async function getBookingsForEmail(email, afterDate) {
  const params = new URLSearchParams({ attendeeEmail: email })
  if (afterDate) params.set('afterStart', afterDate)
  const data = await calFetch(`/bookings?${params}`)
  return data.data || data.bookings || []
}

async function getBookingsForWeek(startDate, endDate) {
  const params = new URLSearchParams({ afterStart: startDate, beforeEnd: endDate })
  const data = await calFetch(`/bookings?${params}`)
  return data.data || data.bookings || []
}

async function rescheduleBooking(bookingId, newStartTime) {
  return calFetch(`/bookings/${bookingId}/reschedule`, {
    method: 'POST',
    body: JSON.stringify({ start: newStartTime }),
  })
}

async function cancelBooking(bookingUid, reason = 'Cancelled by admin') {
  return calFetch(`/bookings/${bookingUid}/cancel`, {
    method: 'POST',
    body: JSON.stringify({ cancellationReason: reason }),
  })
}

module.exports = { getBookingsForEmail, getBookingsForWeek, rescheduleBooking, cancelBooking }

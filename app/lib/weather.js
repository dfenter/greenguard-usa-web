// Open-Meteo weather forecast — free, no API key required.
// Default coordinates cover the Austin TX service area.

const DEFAULT_LAT = 30.2672
const DEFAULT_LON = -97.7431
const DEFAULT_TZ  = 'America/Chicago'

async function getForecast(lat = DEFAULT_LAT, lon = DEFAULT_LON, tz = DEFAULT_TZ) {
  const url = new URL('https://api.open-meteo.com/v1/forecast')
  url.searchParams.set('latitude', lat)
  url.searchParams.set('longitude', lon)
  url.searchParams.set('daily', 'precipitation_probability_max,wind_speed_10m_max,temperature_2m_max,temperature_2m_min')
  url.searchParams.set('temperature_unit', 'fahrenheit')
  url.searchParams.set('wind_speed_unit', 'mph')
  url.searchParams.set('timezone', tz)
  url.searchParams.set('forecast_days', '3')

  const res = await fetch(url)
  if (!res.ok) throw new Error(`Open-Meteo error: ${res.status}`)
  return res.json()
}

// Returns forecast for a specific YYYY-MM-DD date, or null if not in the 3-day window.
async function getDayForecast(dateStr) {
  const data = await getForecast()
  const idx = data.daily.time.indexOf(dateStr)
  if (idx === -1) return null
  return {
    date:            dateStr,
    rainProbability: data.daily.precipitation_probability_max[idx],
    windSpeedMph:    data.daily.wind_speed_10m_max[idx],
    tempHighF:       Math.round(data.daily.temperature_2m_max[idx]),
    tempLowF:        Math.round(data.daily.temperature_2m_min[idx]),
  }
}

// Returns a plain-English one-liner: "Sunny, 94°F" or "Rain likely (80%), 78°F"
function formatForecastLine(f) {
  if (!f) return null
  const parts = []
  if (f.rainProbability > 60) {
    parts.push(`Rain likely (${f.rainProbability}%)`)
  } else if (f.rainProbability >= 30) {
    parts.push(`Chance of rain (${f.rainProbability}%)`)
  } else {
    parts.push('Sunny')
  }
  if (f.windSpeedMph > 20) parts.push(`windy (${Math.round(f.windSpeedMph)} mph)`)
  else if (f.windSpeedMph >= 12) parts.push(`breezy (${Math.round(f.windSpeedMph)} mph)`)
  parts.push(`${f.tempHighF}°F high`)
  return parts.join(', ')
}

// Returns true if conditions are service-blocking (rain > 60% or sustained wind > 20 mph).
// CO2 trap service can proceed in light rain; barrier spray cannot.
function isBadWeather(f) {
  if (!f) return false
  return f.rainProbability > 60 || f.windSpeedMph > 20
}

module.exports = { getForecast, getDayForecast, formatForecastLine, isBadWeather }

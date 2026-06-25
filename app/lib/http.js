// Shared fetch with timeout + bounded retry/backoff.
//
// External calls (Cal.com, HubSpot REST, Google) can hang or blip; without a
// deadline a single slow upstream stalls a whole getServerSideProps render.
// fetchWithTimeout aborts after timeoutMs and retries transient failures
// (network errors, timeouts, 429, 5xx) with exponential backoff.

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504])

async function fetchWithTimeout(url, options = {}, { timeoutMs = 8000, retries = 2, backoffMs = 300 } = {}) {
  let lastErr
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await fetch(url, { ...options, signal: controller.signal })
      clearTimeout(timer)
      // Retry transient HTTP errors (but only if we have attempts left)
      if (RETRYABLE_STATUS.has(res.status) && attempt < retries) {
        await sleep(backoffMs * 2 ** attempt)
        continue
      }
      return res
    } catch (err) {
      clearTimeout(timer)
      lastErr = err
      if (attempt < retries) {
        await sleep(backoffMs * 2 ** attempt)
        continue
      }
    }
  }
  throw lastErr || new Error(`fetchWithTimeout failed: ${url}`)
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

module.exports = { fetchWithTimeout }

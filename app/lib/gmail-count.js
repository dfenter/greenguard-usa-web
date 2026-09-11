// Counts SENT Gmail messages matching a search query, via the same GMAIL_*
// admin@ OAuth token lib/email.js uses to send (GOOGLE_* calendar token as
// fallback). Used by the /proof endpoint to derive reminder/follow-up counts
// from the actual sent mailbox rather than a guess.

const { google } = require('googleapis')

function getGmailAuth() {
  const clientId = process.env.GMAIL_CLIENT_ID || process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GMAIL_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN || process.env.GOOGLE_REFRESH_TOKEN
  const auth = new google.auth.OAuth2(clientId, clientSecret)
  auth.setCredentials({ refresh_token: refreshToken })
  return auth
}

// Paginates users.messages.list to completion and returns the total count.
// Throws on any API failure — callers are expected to try/catch and omit.
async function countSentMessages(query) {
  const gmail = google.gmail({ version: 'v1', auth: getGmailAuth() })
  let count = 0
  let pageToken
  do {
    const res = await gmail.users.messages.list({
      userId: 'me',
      q: query,
      pageToken,
      maxResults: 500,
    })
    const messages = res?.data?.messages || []
    count += messages.length
    pageToken = res?.data?.nextPageToken
  } while (pageToken)
  return count
}

// Paginates users.messages.list, then fetches only the Subject header of
// each match (format 'metadata', metadataHeaders ['Subject'] — never full
// message or body) and returns the count of DISTINCT subjects seen. Used
// where the same daily email can legitimately be sent twice (e.g. a backup
// sender resending the same day's route) and only the distinct-day count
// matters. Throws on any API failure — callers are expected to try/catch.
// keyFn optionally normalizes a subject before dedup (e.g. strip a variable tail).
const MAX_SUBJECT_FETCH = 500

async function countDistinctSentSubjects(query, keyFn) {
  let fetched = 0
  const gmail = google.gmail({ version: 'v1', auth: getGmailAuth() })
  const subjects = new Set()
  let pageToken
  do {
    const res = await gmail.users.messages.list({
      userId: 'me',
      q: query,
      pageToken,
      maxResults: 500,
    })
    const messages = res?.data?.messages || []
    for (const m of messages) {
      if (fetched >= MAX_SUBJECT_FETCH) throw new Error('countDistinctSentSubjects: too many matches, refusing to page through them')
      fetched += 1
      const detail = await gmail.users.messages.get({
        userId: 'me',
        id: m.id,
        format: 'metadata',
        metadataHeaders: ['Subject'],
      })
      const subjectHeader = (detail?.data?.payload?.headers || []).find(
        (h) => h.name === 'Subject'
      )
      const raw = subjectHeader ? subjectHeader.value : ''
      subjects.add(keyFn ? keyFn(raw) : raw)
    }
    pageToken = res?.data?.nextPageToken
  } while (pageToken)
  return subjects.size
}

module.exports = { countSentMessages, countDistinctSentSubjects }

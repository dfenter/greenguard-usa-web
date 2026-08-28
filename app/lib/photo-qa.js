// Photo QA — runs Gemini vision against a trap-install photo and writes
// the assessment to HubSpot for audit. Fail-soft: never blocks the upload.

const { visionJSON } = require('./gemini')
const { findContactByEmail, addNote } = require('./hubspot')
const biz = require('./business.config')

const SYSTEM = `You are a quality auditor for ${biz.nameShort}, a mosquito-control company that installs CO₂ traps and tanks at customer properties.

You receive a photo from a technician documenting an install or service visit. Your job is to verify the install looks correct.`

const PROMPT = `Inspect this trap-install photo and return JSON with these exact keys:
  trap_visible: bool        — Is the Biogents trap (a box-like device, often green) visible?
  tank_visible: bool        — Is a CO₂ tank (cylindrical, silver/grey or painted) visible?
  tubing_ok: bool|null      — Is tubing visible AND apparently connected (not kinked/disconnected)? null if not visible
  placement_ok: bool|null   — Is the trap in shade or a reasonable spot (not direct sun, not flooded, not knocked over)? null if can't tell
  issues: string[]          — List any specific concerns (max 5 short strings). Empty array if nothing to flag.
  confidence: number        — Your overall confidence in this assessment (0-1)
  overall_pass: bool        — Does this look like an acceptable install? false if you see clear problems.`

async function assessPhoto({ imageUrl, customerEmail, caption }) {
  let result
  try {
    result = await visionJSON({ system: SYSTEM, imageUrl, prompt: PROMPT, maxTokens: 512 })
  } catch (e) {
    return { ok: false, error: e.message }
  }

  // Log to HubSpot
  if (customerEmail) {
    try {
      const contact = await findContactByEmail(customerEmail)
      if (contact?.id) {
        const flag = result.overall_pass ? '✓' : '⚠'
        const issues = (result.issues || []).join('; ')
        const body = [
          `[PHOTO-QA] ${flag} confidence=${result.confidence ?? '?'}  overall_pass=${result.overall_pass}`,
          `trap_visible=${result.trap_visible}  tank_visible=${result.tank_visible}  tubing_ok=${result.tubing_ok}  placement_ok=${result.placement_ok}`,
          issues ? `Issues: ${issues}` : null,
          caption ? `Caption: ${caption}` : null,
          `URL: ${imageUrl}`,
        ].filter(Boolean).join('\n')
        await addNote(contact.id, body).catch(() => {})
      }
    } catch {}
  }

  return { ok: true, ...result }
}

module.exports = { assessPhoto }

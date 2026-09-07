// Shared firm-name -> URL slug helper for /gtm/targets/[slug].
function slugifyFirm(firm) {
  return String(firm || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

module.exports = { slugifyFirm }

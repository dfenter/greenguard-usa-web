// Shared scoring helper: 7 sub-scores 0-5 each, total + tier.
// Tier bands: A 25-35, B 18-24, C <18.
function isValidSubScore(v) {
  return Number.isInteger(v) && v >= 0 && v <= 5
}

function scoreTotalAndTier(scores) {
  const keys = ['s1', 's2', 's3', 's4', 's5', 's6', 's7']
  for (const k of keys) {
    if (!isValidSubScore(scores[k])) throw new Error(`invalid score ${k}: must be an integer 0-5`)
  }
  const total = keys.reduce((sum, k) => sum + scores[k], 0)
  let tier
  if (total >= 25) tier = 'A'
  else if (total >= 18) tier = 'B'
  else tier = 'C'
  return { total, tier }
}

module.exports = { isValidSubScore, scoreTotalAndTier }

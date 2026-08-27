// Refresh src/data/reviews.json from Google Places API (New).
// Runs as `prebuild`; silently keeps the committed JSON if the key is missing or the call fails.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const target = join(here, '..', 'src', 'data', 'reviews.json');
const PLACE_ID = 'ChIJx8wLC4K11wwRbfe7hhZiHXs';

function loadKey() {
  if (process.env.PLACES_SERVER_KEY) return process.env.PLACES_SERVER_KEY;
  for (const p of [join(here, '..', '.env'), join(here, '..', '..', 'app', '.env')]) {
    try {
      const m = readFileSync(p, 'utf8').match(/^PLACES_SERVER_KEY=(.+)$/m);
      if (m) return m[1].trim();
    } catch {}
  }
  return null;
}

const key = loadKey();
if (!key) { console.log('[reviews] PLACES_SERVER_KEY not set; keeping committed reviews.json'); process.exit(0); }

try {
  const res = await fetch(`https://places.googleapis.com/v1/places/${PLACE_ID}`, {
    headers: { 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': 'rating,userRatingCount,reviews' },
  });
  const d = await res.json();
  if (!res.ok || !d.userRatingCount) throw new Error(JSON.stringify(d).slice(0, 300));
  const current = JSON.parse(readFileSync(target, 'utf8'));
  const reviews = (d.reviews || []).map((r) => ({
    author: r.authorAttribution?.displayName || 'Google user',
    rating: r.rating,
    text: (r.text?.text || r.originalText?.text || '').trim(),
    time: r.relativePublishTimeDescription || '',
    source: 'google',
  }));
  const next = { google: { place_id: PLACE_ID, rating: d.rating, total: d.userRatingCount, reviews }, manual: current.manual || [] };
  writeFileSync(target, JSON.stringify(next, null, 2) + '\n');
  console.log(`[reviews] refreshed: ${d.rating} stars, ${d.userRatingCount} reviews, ${reviews.length} recent`);
} catch (e) {
  console.log('[reviews] refresh failed, keeping committed reviews.json:', e.message);
}

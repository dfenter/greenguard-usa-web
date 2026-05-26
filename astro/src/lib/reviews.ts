// Reviews are fetched from Google Places API at build time. Cloudflare
// Workers Cron pings the Vercel astro deploy hook daily to keep the bundled
// data fresh. No on-disk JSON; no GitHub Actions sync.
//
// If the Places API call fails (rate limit, missing key during local dev),
// the loader returns empty arrays / default 5-star metadata so builds never
// break.

const PLACE_ID = 'ChIJx8wLC4K11wwRbfe7hhZiHXs';
const API_KEY =
  import.meta.env.GOOGLE_PLACES_API_KEY ||
  import.meta.env.GOOGLE_MAPS_API_KEY ||
  process.env.GOOGLE_PLACES_API_KEY ||
  process.env.GOOGLE_MAPS_API_KEY ||
  '';

export interface Review {
  author: string;
  rating: number;
  text: string;
  time: string;
  source: string;
  location?: string;
}

interface PlacesResponse {
  id?: string;
  rating?: number;
  userRatingCount?: number;
  reviews?: Array<{
    authorAttribution?: { displayName?: string };
    rating?: number;
    text?: { text?: string };
    relativePublishTimeDescription?: string;
  }>;
}

interface CachedReviews {
  reviews: Review[];
  rating: number;
  total: number;
  placeId: string;
}

let cached: CachedReviews | null = null;

async function loadFromPlaces(): Promise<CachedReviews> {
  if (cached) return cached;
  if (!API_KEY) {
    cached = { reviews: [], rating: 5, total: 0, placeId: PLACE_ID };
    return cached;
  }
  try {
    const res = await fetch(`https://places.googleapis.com/v1/places/${PLACE_ID}`, {
      headers: {
        'X-Goog-Api-Key': API_KEY,
        'X-Goog-FieldMask': 'id,rating,userRatingCount,reviews',
      },
    });
    if (!res.ok) throw new Error(`Places API ${res.status}`);
    const data = (await res.json()) as PlacesResponse;
    const reviews: Review[] = (data.reviews ?? []).map((r) => ({
      author: r.authorAttribution?.displayName ?? '',
      rating: r.rating ?? 5,
      text: r.text?.text ?? '',
      time: r.relativePublishTimeDescription ?? '',
      source: 'google',
    }));
    cached = {
      reviews,
      rating: data.rating ?? 5,
      total: data.userRatingCount ?? 0,
      placeId: data.id ?? PLACE_ID,
    };
    return cached;
  } catch (e) {
    console.warn('[reviews] Places fetch failed, using fallback:', (e as Error).message);
    cached = { reviews: [], rating: 5, total: 0, placeId: PLACE_ID };
    return cached;
  }
}

function relativeToDays(s: string): number {
  if (!s) return 9999;
  const lower = s.toLowerCase();
  if (lower.includes('hour') || lower.includes('today')) return 0.5;
  const dayMatch = lower.match(/(\d+)\s*day/);
  if (dayMatch) return parseInt(dayMatch[1]!);
  if (lower.includes('a day ago') || lower.includes('yesterday')) return 1;
  if (lower.includes('in the last week')) return 5;
  if (lower.includes('a week ago')) return 7;
  const wkMatch = lower.match(/(\d+)\s*week/);
  if (wkMatch) return parseInt(wkMatch[1]!) * 7;
  if (lower.includes('a month ago')) return 30;
  const moMatch = lower.match(/(\d+)\s*month/);
  if (moMatch) return parseInt(moMatch[1]!) * 30;
  if (lower.includes('a year ago')) return 365;
  const yrMatch = lower.match(/(\d+)\s*year/);
  if (yrMatch) return parseInt(yrMatch[1]!) * 365;
  return 100;
}

export async function getLatestReviews(count = 3): Promise<Review[]> {
  const data = await loadFromPlaces();
  const all = [...data.reviews].reverse();
  all.sort((a, b) => relativeToDays(a.time) - relativeToDays(b.time));
  return all.slice(0, count);
}

export async function getReviewMeta() {
  const data = await loadFromPlaces();
  return {
    averageRating: data.rating,
    totalReviews: data.total,
    placeId: data.placeId,
  };
}

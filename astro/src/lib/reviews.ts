// Read reviews.json from the repo root (one level above /astro)
// fetch_reviews.py keeps this fresh daily via GitHub Actions
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REVIEWS_PATH = path.resolve(__dirname, '../../../reviews.json');

export interface Review {
  author: string;
  rating: number;
  text: string;
  time: string;       // relative time string from Places API
  source: string;
  location?: string;
}

interface ReviewsFile {
  google?: { reviews?: Review[]; rating?: number; total?: number; place_id?: string };
  manual?: Review[];
}

function loadFile(): ReviewsFile {
  try {
    return JSON.parse(fs.readFileSync(REVIEWS_PATH, 'utf8'));
  } catch {
    return {};
  }
}

// Newest reviews appear first in the Places API response by default.
// "in the last week" / "a week ago" / "2 weeks ago" / "a month ago" / etc.
// We rank by parsing that string into an approximate day count.
function relativeToDays(s: string): number {
  if (!s) return 9999;
  const lower = s.toLowerCase();
  if (lower.includes('hour') || lower.includes('day ago') || lower.includes('today')) return 1;
  if (lower.includes('in the last week') || lower.includes('week ago') && !lower.match(/\d/)) return 7;
  const wkMatch = lower.match(/(\d+)\s*week/);
  if (wkMatch) return parseInt(wkMatch[1]) * 7;
  const moMatch = lower.match(/(\d+)\s*month/);
  if (moMatch) return parseInt(moMatch[1]) * 30;
  if (lower.includes('a month')) return 30;
  const yrMatch = lower.match(/(\d+)\s*year/);
  if (yrMatch) return parseInt(yrMatch[1]) * 365;
  if (lower.includes('a year')) return 365;
  return 100;
}

export function getLatestReviews(count = 3): Review[] {
  const file = loadFile();
  const all: Review[] = [...(file.google?.reviews ?? [])];
  all.sort((a, b) => relativeToDays(a.time) - relativeToDays(b.time));
  return all.slice(0, count);
}

export function getReviewMeta() {
  const file = loadFile();
  return {
    averageRating: file.google?.rating ?? 5,
    totalReviews: file.google?.total ?? 0,
    placeId: file.google?.place_id ?? '',
  };
}

// Reviews are sourced from reviews.json which is kept fresh by the
// fetch-reviews.yml GitHub Action (daily at 3am CT). The file is at the
// repo root, but Vercel's rootDirectory=astro doesn't include parent-dir
// files in the build, so we fetch it over HTTPS from the live site at
// build time. Local dev falls back to the filesystem.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCAL_PATH = path.resolve(__dirname, '../../../reviews.json');
const REMOTE_URL = 'https://www.greenguard-usa.com/reviews.json';

export interface Review {
  author: string;
  rating: number;
  text: string;
  time: string;
  source: string;
  location?: string;
}

interface ReviewsFile {
  google?: { reviews?: Review[]; rating?: number; total?: number; place_id?: string };
  manual?: Review[];
}

let cache: ReviewsFile | null = null;

async function load(): Promise<ReviewsFile> {
  if (cache) return cache;
  // Try local file first (faster for local dev)
  try {
    if (fs.existsSync(LOCAL_PATH)) {
      cache = JSON.parse(fs.readFileSync(LOCAL_PATH, 'utf8'));
      return cache!;
    }
  } catch {
    // fall through to remote
  }
  // Fall back to fetching from live site (Vercel build context)
  try {
    const res = await fetch(REMOTE_URL, { cache: 'no-store' as any });
    if (res.ok) {
      cache = await res.json();
      return cache!;
    }
  } catch {
    // ignore
  }
  cache = {};
  return cache;
}

function relativeToDays(s: string): number {
  if (!s) return 9999;
  const lower = s.toLowerCase();
  if (lower.includes('hour') || lower.includes('today')) return 0.5;
  if (lower.match(/\bday(s)?\s+ago/)) {
    const m = lower.match(/(\d+)\s*day/);
    return m ? parseInt(m[1]!) : 1;
  }
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
  const file = await load();
  const all: Review[] = [...(file.google?.reviews ?? [])];
  all.sort((a, b) => relativeToDays(a.time) - relativeToDays(b.time));
  return all.slice(0, count);
}

export async function getReviewMeta() {
  const file = await load();
  return {
    averageRating: file.google?.rating ?? 5,
    totalReviews: file.google?.total ?? 0,
    placeId: file.google?.place_id ?? '',
  };
}

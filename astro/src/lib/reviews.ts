// Reviews are bundled at build time from src/data/reviews.json, which is
// kept in sync with the root reviews.json by the fetch-reviews.yml GitHub
// Action. Static import avoids any build-time network dependency on
// Vercel, where rootDirectory=astro excludes parent-dir files.
import reviewsData from '../data/reviews.json';

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

const file = reviewsData as ReviewsFile;

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

export function getLatestReviews(count = 3): Review[] {
  const all: Review[] = [...(file.google?.reviews ?? [])].reverse();
  all.sort((a, b) => relativeToDays(a.time) - relativeToDays(b.time));
  return all.slice(0, count);
}

export function getReviewMeta() {
  return {
    averageRating: file.google?.rating ?? 5,
    totalReviews: file.google?.total ?? 0,
    placeId: file.google?.place_id ?? '',
  };
}

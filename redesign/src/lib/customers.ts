// Build-time customer count: Stripe paid customers + filtered HubSpot prospects.
// Falls back to a baked-in floor if API calls fail so the build never breaks.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_PATH = path.resolve(__dirname, '../../.cache/customer-count.json');

// Floor used when both APIs fail or env vars are missing locally.
// Reflects last known baseline of 165.
const FALLBACK = 160;

const VENDOR_DOMAINS = new Set([
  'biogents.com', 'mosqitter.com', 'hubspot.com', 'cal.com',
  'resend.com', 'resend.dev', 'airgas.com', 'yelp.com', 'redditads.com',
  'judge.me', 'nextdoor.com', 'aramark.com', 'grandliving.com',
]);

async function getStripePaidEmails(): Promise<Set<string>> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return new Set();
  const emails = new Set<string>();
  let starting_after: string | undefined;
  for (let i = 0; i < 10; i++) {
    const params = new URLSearchParams({ limit: '100' });
    if (starting_after) params.set('starting_after', starting_after);
    const res = await fetch(`https://api.stripe.com/v1/customers?${params}`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!res.ok) break;
    const data: any = await res.json();
    for (const c of data.data ?? []) {
      if (!c.email) continue;
      // Has at least one paid invoice?
      const invRes = await fetch(
        `https://api.stripe.com/v1/invoices?customer=${c.id}&status=paid&limit=1`,
        { headers: { Authorization: `Bearer ${key}` } }
      );
      const inv: any = await invRes.json();
      if (inv.data?.length) emails.add(c.email.toLowerCase());
    }
    if (!data.has_more) break;
    starting_after = data.data[data.data.length - 1]?.id;
  }
  return emails;
}

async function getHubspotProspectEmails(): Promise<Set<string>> {
  const token = process.env.HUBSPOT_ACCESS_TOKEN;
  if (!token) return new Set();
  const emails = new Set<string>();
  let after: string | undefined;
  for (let i = 0; i < 10; i++) {
    const params = new URLSearchParams({ limit: '100', properties: 'email,firstname' });
    if (after) params.set('after', after);
    const res = await fetch(`https://api.hubapi.com/crm/v3/objects/contacts?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) break;
    const data: any = await res.json();
    for (const c of data.results ?? []) {
      const email = (c.properties?.email ?? '').toLowerCase();
      if (!email) continue;
      const domain = email.split('@')[1] ?? '';
      if (VENDOR_DOMAINS.has(domain)) continue;
      const first = (c.properties?.firstname ?? '').toLowerCase();
      if (first.includes('sample contact')) continue;
      if (email.startsWith('test-')) continue;
      emails.add(email);
    }
    after = data.paging?.next?.after;
    if (!after) break;
  }
  return emails;
}

function readCache(): number | null {
  try {
    const data = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
    return typeof data.count === 'number' ? data.count : null;
  } catch {
    return null;
  }
}

function writeCache(count: number) {
  try {
    fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
    fs.writeFileSync(CACHE_PATH, JSON.stringify({ count, fetchedAt: new Date().toISOString() }, null, 2));
  } catch {
    // ignore — cache is best-effort
  }
}

export async function getCustomerCount(): Promise<number> {
  try {
    const [stripe, hubspot] = await Promise.all([
      getStripePaidEmails(),
      getHubspotProspectEmails(),
    ]);
    const union = new Set([...stripe, ...hubspot]);
    if (union.size > 0) {
      writeCache(union.size);
      return union.size;
    }
  } catch {
    // fall through to cache
  }
  return readCache() ?? FALLBACK;
}

// Round down to nearest 10 for marketing display: 165 -> "160+"
export function formatCount(n: number): string {
  if (n < 10) return `${n}`;
  const bucket = Math.floor(n / 10) * 10;
  return `${bucket}+`;
}

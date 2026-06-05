#!/usr/bin/env node
/**
 * Generates a Google Ads Editor bulk upload CSV for GreenGuard USA campaigns.
 *
 * Usage:
 *   node _scripts/generate-ads-editor-csv.js
 *
 * Output:
 *   _scripts/greenguard-ads-import.csv
 *
 * Import steps:
 *   1. Download Google Ads Editor from https://ads.google.com/home/tools/ads-editor/
 *   2. Open your account, click File → Import → From CSV
 *   3. Select the generated CSV, review changes, click Post
 */

const fs = require('fs');
const path = require('path');

const rows = [];

// CSV header — Ads Editor format
const HEADERS = [
  'Row Type',
  'Action',
  'Status',
  'Campaign',
  'Campaign Budget',
  'Campaign Type',
  'Bid Strategy Type',
  'Network (Search Partners)',
  'Network (Display Network)',
  'Ad Group',
  'Max CPC',
  'Keyword',
  'Match Type',
  'Final URL',
  'Headline 1',
  'Headline 2',
  'Headline 3',
  'Headline 4',
  'Headline 5',
  'Headline 6',
  'Description 1',
  'Description 2',
  'Path 1',
  'Path 2',
  'Callout text',
  'Structured snippet header',
  'Structured snippet values',
];

function csvField(v) {
  const s = String(v ?? '');
  return (s.includes(',') || s.includes('"') || s.includes('\n')) ? `"${s.replace(/"/g, '""')}"` : s;
}

function row(obj) {
  rows.push(HEADERS.map(h => csvField(obj[h] ?? '')).join(','));
}

// ── Campaign 1: Brand ─────────────────────────────────────────────────────────
row({
  'Row Type': 'Campaign',
  'Action': 'Add',
  'Status': 'Paused',
  'Campaign': 'GreenGuard — Brand',
  'Campaign Budget': '5.00',
  'Campaign Type': 'Search',
  'Bid Strategy Type': 'Manual CPC',
  'Network (Search Partners)': 'true',
  'Network (Display Network)': 'false',
});

row({
  'Row Type': 'Ad Group',
  'Action': 'Add',
  'Status': 'Enabled',
  'Campaign': 'GreenGuard — Brand',
  'Ad Group': 'Brand Terms',
  'Max CPC': '2.00',
});

for (const kw of ['greenguard usa', 'green guard usa', 'greenguard austin', 'greenguard mosquito control']) {
  row({
    'Row Type': 'Keyword',
    'Action': 'Add',
    'Status': 'Enabled',
    'Campaign': 'GreenGuard — Brand',
    'Ad Group': 'Brand Terms',
    'Keyword': kw,
    'Match Type': 'Exact',
  });
}

row({
  'Row Type': 'Responsive search ad',
  'Action': 'Add',
  'Status': 'Enabled',
  'Campaign': 'GreenGuard — Brand',
  'Ad Group': 'Brand Terms',
  'Final URL': 'https://www.greenguard-usa.com/',
  'Headline 1': 'GreenGuard USA',
  'Headline 2': 'CO2 Mosquito Control Austin',
  'Headline 3': 'Pesticide-Free Trap Service',
  'Headline 4': 'Austin TX - Local & Trusted',
  'Headline 5': 'Free Property Assessment',
  'Headline 6': 'No Contracts - Cancel Anytime',
  'Description 1': 'Pesticide-free CO2 mosquito traps serviced monthly. Free property assessment.',
  'Description 2': 'No contracts. Results in 30 days or we adjust. Austin-owned and operated.',
  'Path 1': 'mosquito',
  'Path 2': 'control',
});

// ── Campaign 2: Local Service ─────────────────────────────────────────────────
row({
  'Row Type': 'Campaign',
  'Action': 'Add',
  'Status': 'Paused',
  'Campaign': 'GreenGuard — Local Service Austin',
  'Campaign Budget': '25.00',
  'Campaign Type': 'Search',
  'Bid Strategy Type': 'Maximize Conversions',
  'Network (Search Partners)': 'true',
  'Network (Display Network)': 'false',
});

const localAdGroups = [
  {
    name: 'Mosquito Control Austin',
    maxCpc: '4.00',
    keywords: [
      { text: 'mosquito control austin', match: 'Phrase' },
      { text: 'mosquito control austin tx', match: 'Phrase' },
      { text: 'mosquito service austin', match: 'Phrase' },
      { text: 'co2 mosquito control', match: 'Phrase' },
      { text: 'pesticide free mosquito control', match: 'Phrase' },
      { text: 'mosquito trap service austin', match: 'Phrase' },
    ],
    h1: 'Mosquito Control Austin TX',
    h2: 'Pesticide-Free CO2 Traps',
    h3: 'Free Property Assessment',
    h4: 'Starting at $79 Per Month',
    h5: 'No Pesticides - No Contracts',
    h6: 'Austin-Owned and Operated',
    d1: 'We install and maintain CO2 mosquito traps on your property. No pesticides ever.',
    d2: 'Starting at $79/mo. Catch 1,000+ mosquitoes per night. Book a free walkthrough.',
    p1: 'austin',
    p2: 'mosquito',
    url: 'https://www.greenguard-usa.com/book',
  },
  {
    name: 'Mosquito Control Near Me',
    maxCpc: '3.50',
    keywords: [
      { text: 'mosquito control near me', match: 'Phrase' },
      { text: 'mosquito control service near me', match: 'Phrase' },
      { text: 'local mosquito control', match: 'Broad' },
      { text: 'outdoor mosquito control', match: 'Phrase' },
    ],
    h1: 'Mosquito Control Near You',
    h2: 'Serving Greater Austin TX',
    h3: 'Book a Free Assessment',
    h4: 'CO2 Traps - No Chemicals',
    h5: 'Cedar Park Round Rock Westlake',
    h6: 'Monthly Service Included',
    d1: 'GreenGuard serves Austin, Cedar Park, Round Rock, Westlake Hills and 10 more cities.',
    d2: 'Trap rental from $79/mo. We handle installation, CO2 refills, and monthly service.',
    p1: 'near',
    p2: 'me',
    url: 'https://www.greenguard-usa.com/book',
  },
  {
    name: 'Suburb Targeting',
    maxCpc: '3.00',
    keywords: [
      { text: 'mosquito control cedar park', match: 'Phrase' },
      { text: 'mosquito control round rock', match: 'Phrase' },
      { text: 'mosquito control westlake hills', match: 'Phrase' },
      { text: 'mosquito control lakeway tx', match: 'Phrase' },
      { text: 'mosquito control bee cave', match: 'Phrase' },
    ],
    h1: 'Mosquito Control {KeyWord:Your City}',
    h2: 'CO2 Traps - No Sprays',
    h3: 'Free Assessment This Week',
    h4: 'Serving All Austin Suburbs',
    h5: 'Pesticide-Free Service',
    h6: 'Cancel Anytime - No Contracts',
    d1: 'Serving Cedar Park, Round Rock, Westlake, Lakeway, Bee Cave and surrounding suburbs.',
    d2: 'Pesticide-free. No contracts. Monthly service included. Book your free walkthrough.',
    p1: 'austin',
    p2: 'area',
    url: 'https://www.greenguard-usa.com/book',
  },
];

for (const ag of localAdGroups) {
  row({
    'Row Type': 'Ad Group',
    'Action': 'Add',
    'Status': 'Enabled',
    'Campaign': 'GreenGuard — Local Service Austin',
    'Ad Group': ag.name,
    'Max CPC': ag.maxCpc,
  });
  for (const kw of ag.keywords) {
    row({
      'Row Type': 'Keyword',
      'Action': 'Add',
      'Status': 'Enabled',
      'Campaign': 'GreenGuard — Local Service Austin',
      'Ad Group': ag.name,
      'Keyword': kw.text,
      'Match Type': kw.match,
    });
  }
  row({
    'Row Type': 'Responsive search ad',
    'Action': 'Add',
    'Status': 'Enabled',
    'Campaign': 'GreenGuard — Local Service Austin',
    'Ad Group': ag.name,
    'Final URL': ag.url,
    'Headline 1': ag.h1,
    'Headline 2': ag.h2,
    'Headline 3': ag.h3,
    'Headline 4': ag.h4,
    'Headline 5': ag.h5,
    'Headline 6': ag.h6,
    'Description 1': ag.d1,
    'Description 2': ag.d2,
    'Path 1': ag.p1,
    'Path 2': ag.p2,
  });
}

// ── Campaign 3: Products ──────────────────────────────────────────────────────
row({
  'Row Type': 'Campaign',
  'Action': 'Add',
  'Status': 'Paused',
  'Campaign': 'GreenGuard — Products Equipment',
  'Campaign Budget': '10.00',
  'Campaign Type': 'Search',
  'Bid Strategy Type': 'Maximize Clicks',
  'Network (Search Partners)': 'true',
  'Network (Display Network)': 'false',
});

row({
  'Row Type': 'Ad Group',
  'Action': 'Add',
  'Status': 'Enabled',
  'Campaign': 'GreenGuard — Products Equipment',
  'Ad Group': 'CO2 Trap Products',
  'Max CPC': '3.00',
});

for (const kw of [
  { text: 'biogents mosquitaire', match: 'Phrase' },
  { text: 'biogents trap', match: 'Phrase' },
  { text: 'co2 mosquito trap', match: 'Phrase' },
  { text: 'buy mosquito trap', match: 'Phrase' },
  { text: 'mosquito trap rental austin', match: 'Phrase' },
  { text: 'biogents bg mosquitaire', match: 'Exact' },
]) {
  row({
    'Row Type': 'Keyword',
    'Action': 'Add',
    'Status': 'Enabled',
    'Campaign': 'GreenGuard — Products Equipment',
    'Ad Group': 'CO2 Trap Products',
    'Keyword': kw.text,
    'Match Type': kw.match,
  });
}

row({
  'Row Type': 'Responsive search ad',
  'Action': 'Add',
  'Status': 'Enabled',
  'Campaign': 'GreenGuard — Products Equipment',
  'Ad Group': 'CO2 Trap Products',
  'Final URL': 'https://www.greenguard-usa.com/shop',
  'Headline 1': 'Biogents CO2 Mosquito Traps',
  'Headline 2': 'Buy or Rent in Austin TX',
  'Headline 3': 'Professional Grade Traps',
  'Headline 4': 'BG-Mosquitaire Available Now',
  'Headline 5': 'Free Shipping on Orders $99+',
  'Headline 6': 'CO2 Refills Included in Service',
  'Description 1': 'Shop Biogents BG-Mosquitaire traps. Best CO2 trap for residential use.',
  'Description 2': 'Trap rental with monthly service also available. CO2 refills included.',
  'Path 1': 'shop',
  'Path 2': 'traps',
});

// ── Callout assets (all 3 campaigns) ─────────────────────────────────────────
const callouts = [
  'Pesticide-Free',
  'Free Assessment',
  'No Contracts',
  'Monthly Service Included',
  'Austin-Owned',
  'CO2 Technology',
  'Same Technician Every Visit',
  'Results in 30 Days',
];

const allCampaigns = [
  'GreenGuard — Brand',
  'GreenGuard — Local Service Austin',
  'GreenGuard — Products Equipment',
];

for (const campaign of allCampaigns) {
  for (const text of callouts) {
    row({
      'Row Type': 'Callout',
      'Action': 'Add',
      'Status': 'Enabled',
      'Campaign': campaign,
      'Callout text': text,
    });
  }
}

// ── Structured snippets (all 3 campaigns) ────────────────────────────────────
for (const campaign of allCampaigns) {
  row({
    'Row Type': 'Structured snippet',
    'Action': 'Add',
    'Status': 'Enabled',
    'Campaign': campaign,
    'Structured snippet header': 'Services',
    'Structured snippet values': 'Trap Rental;CO2 Delivery;Free Assessment;Monthly Maintenance;Tank Exchange',
  });
}

// ── Write file ────────────────────────────────────────────────────────────────
const output = [HEADERS.join(','), ...rows].join('\n');
const outPath = path.join(__dirname, 'greenguard-ads-import.csv');
fs.writeFileSync(outPath, output);

console.log('');
console.log('Generated: _scripts/greenguard-ads-import.csv');
console.log('');
console.log('Import steps:');
console.log('  1. Download Google Ads Editor: https://ads.google.com/home/tools/ads-editor/');
console.log('  2. Open GreenGuard account (2754-059-0637)');
console.log('  3. File → Import → From CSV → select greenguard-ads-import.csv');
console.log('  4. Review the 3 campaigns, ad groups, keywords, and ads');
console.log('  5. Click "Post" to push live (stays paused until you enable)');
console.log('');
console.log('After import, do in the UI:');
console.log('  - Campaign "Local Service Austin": Settings → Locations → Austin TX + 30 miles');
console.log('  - All campaigns: Assets → Call → 512-560-4129');
console.log('  - Enable all 3 campaigns');

# {{name}} Analytics & Marketing Performance

GA4, Google Ads, Meta, GBP, and conversion reporting.

## Admin analytics dashboard
{{website}}/admin/analytics
Tabs: Revenue, Traffic, Map, Social, Finance, Accounting, Health

## Google Analytics (GA4)
- Measurement ID: {{ga4Id}}
- Key events tracked: page_view, Book Free Assessment clicks, quote starts, purchases
- GA4 server-side events fired on: checkout.session.completed, invoice.payment_succeeded

## Google Ads
- Conversion tracking wired via offline conversion upload on invoice payment
- Uses `gclid` stored in CRM contact after quote checkout
- Google Ads API — separate `GOOGLE_ADS_*` env vars
- Admin stats: GET `/api/admin/ads-stats`

## Meta (Facebook/Instagram) CAPI
- Pixel ID: {{metaPixelId}}
- Events: Purchase (on payment), Schedule (on booking)
- Requires `META_SYSTEM_USER_TOKEN` env var
- Fires server-side via webhook handlers (deduplication via `event_id`)

## Google Business Profile
- Place ID: {{gbpPlaceId}}
- Reviews fetched on a schedule
- GBP insights: GET `/api/admin/gbp-data`
- Admin Business tab shows GBP insights + reviews

## SEO performance
Run `/{{id}}-seo` to validate structured data.
Key schema types: LocalBusiness (all pages), FAQPage, Service, BreadcrumbList

## Conversion funnel
Landing page → /quote/new → accept quote → checkout → welcome email + booking

## Monthly metrics to review
1. Revenue (from `/{{id}}-books` or `/admin/analytics` Revenue tab)
2. New customers (CRM contacts created this month)
3. Quote conversion rate (QUOTE-SENT → QUOTE-PAID notes)
4. Top traffic pages (GA4)
5. Google Ads cost per conversion
6. GBP views and calls

## Arguments: optional platform (ga4/ads/meta/gbp)
$ARGUMENTS

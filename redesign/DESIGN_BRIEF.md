# GreenGuard USA Redesign — "The Sanctuary" Design Brief

**Architect:** Claude (Fable) orchestrator. This file is the single source of truth for every
implementer and reviewer on this project. Deviations need architect approval.

## Mission

Rebuild the GreenGuard USA marketing site (this Astro project, forked from `../astro`) as a
**luxury outdoor living sanctuary** brand experience that converts Austin homeowners into
booked assessments. Publishes to **new.greenguard-usa.com** (www stays untouched).

The product truth we sell: pesticide-free CO2 mosquito trapping that lets affluent Austin
homeowners actually LIVE in their backyards — dinner parties on the patio, kids on the lawn,
evenings by the pool — without sprays, without killing bees and fireflies. All-electric
service fleet. White-glove monthly service. This is not pest control; this is reclaiming the
most expensive square footage they own.

## Creative Direction: "Quiet Luxury Garden"

Think: high-end landscape architecture studio meets Aman resort spa. Editorial, warm, airy,
botanical. NOT the current dark techy green/neon look. NOT generic pest-control orange-urgency.

### Palette (Tailwind tokens — foundation agent defines in tailwind.config.mjs)

- `ivory` `#FAF7F1` — page base (warm gallery white)
- `linen` `#F2EDE3` — alternate section base
- `ink` `#1E2B23` — primary text, deep botanical green-black
- `pine` `#2E4A3B` — brand green (headers, buttons)
- `sage` `#7C9885` — muted midtone, secondary UI
- `moss` `#4A6B57` — hover/depth
- `brass` `#B08D4C` — luxury accent, used SPARINGLY (rules, eyebrow labels, icons)
- `champagne` `#E5D5B0` — soft accent tint
- `night` `#14201A` — "evening garden" dark sections (footer, CTA band)
- Semantic: `--paper` (ivory), `--text` (ink), success/error kept accessible

Contrast: all text pairs must pass WCAG AA (ink on ivory, ivory on pine/night; brass NEVER
for body text on light backgrounds — labels 14px+ semibold only, or on dark).

### Typography (Google Fonts)

- Display: **Fraunces** (opsz, weights 300-600; soft "SOFT" axis welcome) — headlines,
  oversized editorial scale. h1 clamp(2.6rem, 6vw, 4.5rem), tight leading, slight negative
  tracking. Use italic accents for one emotive word per hero ("*sanctuary*").
- Body/UI: **Inter** (keep, already loaded) 400/500/600. 17-18px body, relaxed leading.
- Eyebrow labels: Inter 12-13px, letter-spacing 0.14em, uppercase, brass or sage.

### Layout language

- max-width 1200px content, generous vertical rhythm (sections 96-140px desktop padding).
- Editorial asymmetry: alternate text/image splits, oversized numerals for steps (Fraunces).
- Hairline rules `1px solid rgba(30,43,35,.12)` and brass 1px accent rules under eyebrows.
- Cards: rounded-2xl, ivory on linen (or reverse), shadow `0 1px 2px rgba(20,32,26,.06),
  0 12px 40px -12px rgba(20,32,26,.12)`, 1px ink/8% border. No glassmorphism on light.
- Dark "evening garden" sections (night bg, champagne/ivory text, brass accents) for the
  pre-footer CTA band and footer — the site breathes light→dark at close.
- Buttons: primary = pine bg, ivory text, rounded-full, px-7 py-3.5, hover→moss with subtle
  translate-y(-1px) + shadow bloom. Secondary = 1px ink/20% border ghost. Focus rings visible.
- Motion: IntersectionObserver reveal (opacity+12px rise, 0.6s cubic-bezier(.2,.6,.2,1),
  stagger 80ms), ONE shared inline script in Base. Hero: slow 14s scale(1.0→1.06) on media.
  `prefers-reduced-motion` disables all of it. No scroll-jacking, no heavy libraries.
- Iconography: inline SVG, 1.5px stroke, brass or sage. No emoji icons.

### Photography

Available in `public/images/` (kids.jpg, founderPhoto.jpg, results-* videos/photos, product
shots) plus Austin scenery at repo root (`../austintrail.jpg`, `../austinnight.jpeg`,
`../austinrive.jpg`, `../barton.jpg` — copy what you use into `public/images/`). Treat photos
editorially: large radius-24 frames, subtle ink/10% overlay for text legibility, never
stretched. Where photography is weak, lean on typography + color + botanical SVG line art
(subtle leaf/frond strokes, drawn inline, sage at 10-15% opacity) instead of stock-looking
filler. The results videos are PROOF GOLD — feature one prominently (muted loop, rounded
frame) on home and /results.

## Conversion Blueprint (every implementer internalizes this)

Primary CTA everywhere: **"Book a Free Assessment"** → `/book`. Secondary: call
`(512) 792-6047`... use the number found in the forked components — do not invent one.

1. Home hero: emotional promise ("Your backyard, returned to you") + trust chips (bee-safe,
   pesticide-free, all-electric, Austin family-owned) + CTA pair + review stars/count.
2. Social proof early and often: Reviews component restyled, Google rating, mosquito-haul
   results imagery ("one week in one trap").
3. How it works: 3 editorial numbered steps (Assess → Install → Monthly white-glove service).
4. Comparison section (traps vs sprays) — kills the #1 objection; bee/firefly angle.
5. Transparent pricing teaser → /pricing with plan comparison table (Good/Better/Best,
   middle highlighted, "Most popular" brass tag).
6. Seasonal urgency: tasteful banner strip ("Austin mosquito season is peaking — install
   windows this week") — luxury tone, no countdown-timer sleaze.
7. Service-area clarity: ZIP/city strip on home + book page (40-mile Austin radius).
8. Lead capture: restyled LeadCapture (exit/scroll-triggered, ONE per session, elegant card,
   posts to existing portal endpoint) + inline email capture on blog/footer.
9. FAQ page keeps/extends FAQPage JSON-LD schema; answer objections (safety, kids/pets,
   HOA, contracts, guarantee).
10. Every page ends in the dark CTA band. No dead-end pages.

Keep ALL existing analytics: GA4 + AW gtag in Base, event wiring on CTAs (`gtag('event',...)`
patterns already present in forked pages — preserve/extend, never remove). Tidio is NOT used
in this Astro build — do not add it.

## Hard Constraints (non-negotiable)

1. **Work only inside `redesign/`.** Never touch `../astro`, `../app`, repo root html, or
   deploy scripts.
2. **Keep every existing route/slug identical.** All 55 pages must still build. No renames.
3. **Canonicals point to www**: every page's canonical URL must be
   `https://www.greenguard-usa.com<same-path>` (foundation agent implements this once in
   Base.astro; page frontmatter passes no canonical unless special).
4. **Keep functional wiring intact**: /book calendar JS (portal.greenguard-usa.com APIs),
   LeadCapture → portal `/api/leads/subscribe`, CustomerCount, Reviews data, sitemap,
   products-feed.xml.js, all JSON-LD schema blocks (restyle around them).
5. **Shop**: this domain cannot run the serverless cart checkout. Keep shop + product pages
   (restyled), but purchase CTAs link to `https://www.greenguard-usa.com/shop/<product>`
   (label "Order on greenguard-usa.com") or to /book for service conversion. Remove/disable
   the CartDrawer add-to-cart posting to /api/checkout — no broken UI allowed.
6. **`npx astro build` must pass** after your work. Run it before reporting done.
7. **No em dashes anywhere in user-facing copy.** House rule. Use periods, commas, colons.
8. **SEO preserved**: keep or improve every title/description; keep heading hierarchy sane
   (one h1); keep alt text meaningful.
9. Accessibility: AA contrast, visible focus states, nav keyboard-operable, reduced-motion
   respected, tap targets 44px+.
10. Performance: system font fallbacks, `loading="lazy"` below fold, poster on videos,
    no new JS dependencies, no client frameworks. Inline scripts only.
11. Mobile-first: design must be stunning at 390px AND 1440px. The dock/nav must never
    overlap content.

## Component Contract (foundation agent builds; everyone consumes)

- `src/styles/global.css` (imported by Base): CSS vars, reveal classes, shared utilities.
- Base.astro: fonts, canonical→www, analytics, reveal script, skip-link.
- Nav.astro: light/transparent-over-hero nav, scrolled state (ivory blur bg + hairline),
  mobile sheet menu. Links: Services, Pricing, Results, Shop, Blog, About, FAQ + CTA button.
- Footer.astro: night bg, 4-col → stacked, service areas, phone, email capture, legal.
- `src/components/ui/` primitives: `Section.astro` (bg variant prop: ivory|linen|night),
  `Eyebrow.astro`, `Btn.astro` (primary|ghost|onDark), `Card.astro`, `Stars.astro`,
  `CtaBand.astro` (the dark pre-footer band, used by every page), `Faq.astro` (accordion).
- Restyled: Reviews.astro, LeadCapture.astro, CustomerCount.astro.

Consumers: use these primitives; do not fork private copies of them; page-scoped `<style>`
is fine for layout only.

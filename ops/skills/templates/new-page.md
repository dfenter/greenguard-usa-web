# {{name}} Add New Marketing Page

Add a new page to the Astro marketing site.

## File location
`astro/src/pages/PAGENAME.astro`

## Page template (copy and adapt)
```astro
---
import Base from '../layouts/Base.astro';

const title = "Page Title · {{nameShort}}";
const description = "Meta description for SEO — 150-160 chars.";
---
<Base title={title} description={description}>
  <!-- Page content -->

  <!-- Add JSON-LD structured data using set:html (NOT {JSON.stringify()}) -->
  <script type="application/ld+json" slot="head" set:html={JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Service",
    "name": "...",
    "provider": { "@type": "LocalBusiness", "name": "{{name}}" }
  })} />
</Base>
```

## CRITICAL: JSON-LD rule
Always use `set:html={JSON.stringify({...})}` for JSON-LD in Astro.
NEVER use `>{JSON.stringify({...})}</script>` — Astro won't evaluate it; Google sees raw JS.

## Nav/menu
Add the new page to the nav if appropriate — hamburger menu is in `Base.astro`.

## SEO checklist for new page
- [ ] Unique `<title>` with "{{name}}"
- [ ] Unique `<meta description>` 150-160 chars
- [ ] H1 tag with primary keyword
- [ ] JSON-LD structured data (use `set:html`)
- [ ] BreadcrumbList auto-included via Base.astro
- [ ] LocalBusiness auto-included via Base.astro

## Deploy after adding
```bash
cd /path/to/repo
git add astro/src/pages/PAGENAME.astro
git commit -m "feat(astro): add PAGENAME page"
git push origin main
./scripts/deploy.sh astro
```

## Verify JSON-LD after deploy
Run `/{{id}}-seo` and check the new page URL.

## Arguments: page name and description of what it should cover
$ARGUMENTS

# {{name}} SEO Audit

Validate structured data, check for Search Console issues, audit the marketing site.

## JSON-LD validation (run after any Astro deploy)
```python
import urllib.request, re, json
PAGES = ["/", "/pricing", "/faq"]  # add your site's key pages
for slug in PAGES:
    url = f"{{website}}{slug}"
    req = urllib.request.Request(url, headers={"User-Agent": "Googlebot/2.1"})
    html = urllib.request.urlopen(req, timeout=10).read().decode("utf-8", "ignore")
    blocks = re.findall(r'<script[^>]*ld\+json[^>]*>([\s\S]*?)</script>', html)
    for i, b in enumerate(blocks):
        try: d = json.loads(b.strip()); print(f"{slug} block {i+1}: OK {d.get('@type')}")
        except json.JSONDecodeError as e: print(f"{slug} block {i+1}: BROKEN {e}")
```

## Common JSON-LD bug in Astro
`{JSON.stringify({...})}` inside a `<script>` tag is NOT evaluated — use `set:html={JSON.stringify({...})}` instead.

## LocalBusiness schema (Base.astro)
Must have: `name`, `telephone`, `address` (PostalAddress), `geo`, `areaServed`, `aggregateRating`
Located at: `astro/src/layouts/Base.astro`

## BreadcrumbList
Auto-generated from URL path in `Base.astro` using `set:html={JSON.stringify({...})}` with IIFE.

## Checking Search Console
Use Google Search Console MCP or check email for alerts from `search-console-alerts@google.com`.

## After fixing: always run validation and deploy astro
`./scripts/deploy.sh astro` from the repo root

## Arguments: optional URL to check, defaults to all pages
$ARGUMENTS

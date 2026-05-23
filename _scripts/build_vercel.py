#!/usr/bin/env python3
"""
Vercel build script: wraps HTML fragments into full standalone HTML documents.

Fragments are source-controlled as injection payloads for the Squarespace/GitHub Pages
pattern. This script converts them into proper HTML documents served by Vercel directly.
Output goes to out/ (gitignored). Squarespace source files remain untouched.
"""
import os, re, shutil

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT  = os.path.join(REPO, 'out')

BASE_URL   = 'https://www.greenguard-usa.com'
TIDIO_KEY  = '2oaqyblfyjn6xy86vutzzvr1ykg9twav'
TIDIO_SRC  = f'https://code.tidio.co/{TIDIO_KEY}.js'
GA4_ID     = 'G-K2R5H2Z23X'

GOOGLE_FONTS_LINK = (
    '<link rel="preconnect" href="https://fonts.googleapis.com">'
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
    '<link href="https://fonts.googleapis.com/css2?family=Nunito+Sans:ital,wght@0,300;0,400;0,600;0,700;0,800;0,900&display=swap" rel="stylesheet">'
)

# ── Per-page SEO overrides ──────────────────────────────────────────────────
SEO = {
    'lander': {
        'title': 'Eco-Friendly Mosquito Control Austin TX | GreenGuard USA',
        'desc':  'CO2 trap-based mosquito control for Austin, TX. No pesticides, safe for kids, pets, and pollinators. Book a free consultation.',
        'slug':  '/',
    },
    'lander-v2': {
        'title': 'Eco-Friendly Mosquito Control Austin TX | GreenGuard USA',
        'desc':  'CO2 trap-based mosquito control for Austin, TX. No pesticides, safe for kids, pets, and pollinators. Book a free consultation.',
        'slug':  '/lander-v2',
    },
    'about': {
        'title': 'About GreenGuard USA | Austin Mosquito Control',
        'desc':  'GreenGuard USA brings CO2 trap technology to Austin homeowners. Pesticide-free mosquito control, certified Biogents installation, and expert service.',
    },
    'services': {
        'title': 'Mosquito Control Services Austin TX | GreenGuard USA',
        'desc':  'Outdoor Protection Program: mosquito trap rental and CO2 delivery service for Austin homeowners. Flat monthly pricing, no sprays, no contracts.',
    },
    'services-v2': {
        'title': 'Mosquito Control Services | GreenGuard USA',
        'desc':  'Outdoor Protection Program: mosquito trap rental and CO2 delivery service for Austin homeowners. Flat monthly pricing, no sprays, no contracts.',
    },
    'traprental': {
        'title': 'Mosquito Trap Rental Austin TX | GreenGuard USA Outdoor Protection Program',
        'desc':  'Rent a Biogents or Mosqitter Grand mosquito trap. Monthly CO2 delivery included. No upfront cost, all-inclusive outdoor protection.',
    },
    'traprental-v2': {
        'title': 'Mosquito Trap Rental | GreenGuard USA Outdoor Protection Program',
        'desc':  'Rent a Biogents or Mosqitter Grand mosquito trap. Monthly CO2 delivery included. No upfront cost, all-inclusive outdoor protection.',
    },
    'co2delivery': {
        'title': 'CO2 Delivery Service Austin TX | GreenGuard USA',
        'desc':  'Monthly CO2 canister delivery for Biogents and Mosqitter Grand traps in Austin. Hassle-free, on-time, transparent pricing.',
    },
    'pricing': {
        'title': 'Mosquito Control Pricing Austin TX | GreenGuard USA',
        'desc':  'Transparent monthly pricing for CO2 mosquito trap rental and service in Austin. No contracts, no hidden fees.',
    },
    'faq': {
        'title': 'Mosquito Control FAQ | GreenGuard USA',
        'desc':  'Answers to common questions about CO2 mosquito traps, our Outdoor Protection Program, service areas, and how trap-based control works.',
    },
    'contact': {
        'title': 'Contact GreenGuard USA | Austin Mosquito Control',
        'desc':  'Get in touch with GreenGuard USA. Book a free consultation or ask about our Outdoor Protection Program in Austin, TX.',
    },
    'blog': {
        'title': 'Mosquito Control Articles | GreenGuard USA Blog',
        'desc':  'Expert articles on pesticide-free mosquito control, CO2 trapping science, and outdoor living in Austin, TX.',
    },
    'franchise': {
        'title': 'Franchise Opportunities | GreenGuard USA',
        'desc':  'Own a GreenGuard USA franchise. Bring eco-friendly CO2 mosquito control to your market. Learn about territories and investment.',
    },
    'franchise-dallas': {
        'title': 'GreenGuard USA Franchise — Dallas Fort Worth | Mosquito Control',
        'desc':  'GreenGuard USA franchise opportunity in Dallas-Fort Worth. Eco-friendly CO2 mosquito trap service for the DFW metro.',
    },
    'franchise-houston': {
        'title': 'GreenGuard USA Franchise — Houston | Mosquito Control',
        'desc':  'GreenGuard USA franchise opportunity in Houston, TX. Eco-friendly CO2 mosquito control for the greater Houston area.',
    },
    'franchise-san-antonio': {
        'title': 'GreenGuard USA Franchise — San Antonio | Mosquito Control',
        'desc':  'GreenGuard USA franchise opportunity in San Antonio, TX. Eco-friendly CO2 mosquito control for San Antonio homeowners.',
    },
    'franchise-phoenix': {
        'title': 'GreenGuard USA Franchise — Phoenix | Mosquito Control',
        'desc':  'GreenGuard USA franchise opportunity in Phoenix, AZ. Eco-friendly CO2 mosquito control for the Phoenix metro.',
    },
    'shop': {
        'title': 'Shop Mosquito Traps and Equipment | GreenGuard USA',
        'desc':  'Buy Biogents mosquito traps, CO2 tanks, timers, and accessories. Professional-grade equipment used by GreenGuard USA in Austin, TX.',
    },
    'book': {
        'title': 'Book a Free Property Assessment | GreenGuard USA',
        'desc':  'Schedule your free on-site mosquito assessment in Austin, TX. A GreenGuard technician visits, maps pressure zones, and recommends the right solution. No obligation.',
        'slug':  '/book',
    },
    'blog-austin-families-reconsidering-spray-programs': {
        'title': 'Why Austin Families Are Rethinking Mosquito Spray Programs | GreenGuard USA',
        'desc':  'Austin homeowners are switching from pesticide spray programs to CO2 mosquito trapping. Here\'s why families are making the change.',
    },
    'blog-barton-creek-corridor-your-backyard': {
        'title': 'Barton Creek Corridor Mosquito Control | GreenGuard USA',
        'desc':  'Properties along the Barton Creek greenbelt face higher mosquito pressure. Learn how CO2 trapping protects your yard year-round.',
    },
    'blog-cedar-park-leander-mosquito-guide': {
        'title': 'Cedar Park & Leander Mosquito Control Guide | GreenGuard USA',
        'desc':  'A complete mosquito control guide for Cedar Park and Leander homeowners. CO2 trapping, trap placement, and seasonal tips.',
    },
    'blog-covered-patios-mosquito-control': {
        'title': 'Mosquito Control for Covered Patios | GreenGuard USA',
        'desc':  'How to protect a covered patio from mosquitoes without pesticide sprays. CO2 trap placement and best practices for Austin patios.',
    },
    'blog-designing-a-yard-you-will-actually-use': {
        'title': 'Designing a Yard You\'ll Actually Use | GreenGuard USA',
        'desc':  'Outdoor design isn\'t just aesthetics — mosquito control is step one. How Austin homeowners create truly usable outdoor spaces.',
    },
    'blog-difference-between-repelling-and-eliminating': {
        'title': 'Repelling vs Eliminating Mosquitoes: What\'s the Difference? | GreenGuard USA',
        'desc':  'Repellents mask the problem. CO2 traps eliminate it at the source. Understanding the difference and why it matters for your yard.',
    },
    'blog-eliminating-standing-water-austin': {
        'title': 'Eliminating Standing Water in Austin | Mosquito Prevention | GreenGuard USA',
        'desc':  'Standing water is the top mosquito breeding source in Austin. A practical guide to finding and eliminating it on your property.',
    },
    'blog-georgetown-mosquito-season-guide': {
        'title': 'Georgetown TX Mosquito Season Guide | GreenGuard USA',
        'desc':  'When mosquito season peaks in Georgetown TX, what drives it, and how CO2 trapping keeps San Gabriel River corridor properties protected.',
    },
    'blog-hill-country-mosquito-season-dripping-springs': {
        'title': 'Hill Country Mosquito Season — Dripping Springs | GreenGuard USA',
        'desc':  'Dripping Springs and Hill Country mosquito season explained. When to start control, peak months, and how CO2 traps outperform sprays.',
    },
    'blog-how-austin-hosts-keep-guests-comfortable': {
        'title': 'How Austin Hosts Keep Outdoor Guests Comfortable | GreenGuard USA',
        'desc':  'Austin homeowners who entertain outdoors use CO2 mosquito trapping to make guests comfortable without pesticide spray schedules.',
    },
    'blog-how-long-co2-trapping-takes-to-work': {
        'title': 'How Long Does CO2 Mosquito Trapping Take to Work? | GreenGuard USA',
        'desc':  'What to expect in weeks 1–8 of CO2 mosquito trapping. Timeline, population reduction data, and how to maximize results.',
    },
    'blog-lake-travis-waterfront-mosquito-season': {
        'title': 'Lake Travis Waterfront Mosquito Season | GreenGuard USA',
        'desc':  'Waterfront properties on Lake Travis face extreme mosquito pressure. How CO2 trapping protects docks, patios, and shorelines without pesticides.',
    },
    'blog-mosquito-control-dog-owners-austin': {
        'title': 'Mosquito Control for Dog Owners in Austin | GreenGuard USA',
        'desc':  'Pesticide spray programs can harm pets. Austin dog owners are switching to CO2 mosquito trapping for safe, effective yard protection.',
    },
    'blog-mosquito-control-hoa-communities-austin': {
        'title': 'Mosquito Control for HOA Communities in Austin | GreenGuard USA',
        'desc':  'CO2 trap mosquito control for Austin HOAs and master-planned communities. Pesticide-free, no spray schedule conflicts.',
    },
    'blog-mosquito-control-kyle-buda-south-austin': {
        'title': 'Mosquito Control for Kyle, Buda & South Austin | GreenGuard USA',
        'desc':  'CO2 mosquito trapping for the south Austin corridor — Kyle, Buda, and Onion Creek communities. Pesticide-free, effective.',
    },
    'blog-mosquito-control-young-children': {
        'title': 'Mosquito Control for Homes with Young Children | GreenGuard USA',
        'desc':  'Pesticide sprays around young children carry real risks. CO2 mosquito trapping is the safe, chemical-free alternative for Austin families.',
    },
    'blog-outdoor-dining-austin-restaurants-mosquito': {
        'title': 'Outdoor Dining Mosquito Control for Austin Restaurants | GreenGuard USA',
        'desc':  'Austin restaurant patios need mosquito control without spray odors or chemical exposure. CO2 trapping is the hospitality-grade solution.',
    },
    'blog-outdoor-investment-that-changes-everything': {
        'title': 'The Outdoor Investment That Changes Everything | GreenGuard USA',
        'desc':  'Pools and patios go unused without mosquito control. How one investment — CO2 trapping — transforms Austin outdoor living.',
    },
    'blog-outdoor-kitchens-austin-mosquito-problem': {
        'title': 'Austin Outdoor Kitchens Have a Mosquito Problem | GreenGuard USA',
        'desc':  'Outdoor kitchens create heat, CO2, and moisture — prime mosquito attractants. How to protect your Austin outdoor kitchen.',
    },
    'blog-pets-kids-mosquito-control': {
        'title': 'Safe Mosquito Control for Homes with Pets and Kids | GreenGuard USA',
        'desc':  'CO2 trapping is the only mosquito control method that is completely safe for kids, dogs, cats, and backyard chickens.',
    },
    'blog-pflugerville-northeast-austin-mosquito-season': {
        'title': 'Pflugerville & Northeast Austin Mosquito Season | GreenGuard USA',
        'desc':  'Mosquito season guide for Pflugerville and northeast Austin. Lake Pflugerville, Gilleland Creek, and when to start control.',
    },
    'blog-protecting-pollinators-mosquito-control': {
        'title': 'Protecting Pollinators While Controlling Mosquitoes | GreenGuard USA',
        'desc':  'Mosquito sprays kill bees and butterflies. CO2 trapping targets only mosquitoes, keeping pollinators safe in your Austin garden.',
    },
    'blog-taking-back-your-outdoor-space': {
        'title': 'Taking Back Your Outdoor Space from Mosquitoes | GreenGuard USA',
        'desc':  'How Austin homeowners reclaim their yards, patios, and pools with CO2 mosquito trapping. Real results, no pesticides.',
    },
    'blog-what-happens-when-you-spray-for-mosquitoes': {
        'title': 'What Actually Happens When You Spray for Mosquitoes | GreenGuard USA',
        'desc':  'Mosquito spray programs kill more than mosquitoes. What happens to your yard\'s ecosystem, beneficial insects, and soil when you spray.',
    },
    'blog-what-is-actually-in-mosquito-spray': {
        'title': 'What\'s Actually in Mosquito Spray? | GreenGuard USA',
        'desc':  'Pyrethroids, synthetic fragrances, and surfactants — what mosquito spray programs contain and why CO2 trapping is the pesticide-free alternative.',
    },
    'blog-what-to-look-for-mosquito-control-company-austin': {
        'title': 'What to Look for in a Mosquito Control Company in Austin | GreenGuard USA',
        'desc':  'How to evaluate a mosquito control company in Austin. Questions to ask, red flags to avoid, and why CO2 trapping is the standard.',
    },
    'blog-what-westlake-hills-homeowners-doing-differently': {
        'title': 'What Westlake Hills Homeowners Are Doing Differently | GreenGuard USA',
        'desc':  'Westlake Hills properties along the greenbelt face intense mosquito pressure. How the most discerning Austin homeowners are handling it.',
    },
    'blog-what-year-round-outdoor-living-looks-like': {
        'title': 'What Year-Round Outdoor Living Looks Like in Austin | GreenGuard USA',
        'desc':  'Austin weather allows year-round outdoor living — if you control mosquitoes. What that lifestyle looks like with CO2 trapping in place.',
    },
    'blog-when-mosquito-season-actually-starts': {
        'title': 'When Does Mosquito Season Actually Start in Austin? | GreenGuard USA',
        'desc':  'Austin mosquito season starts earlier than most people expect. When to start CO2 trapping and how to get ahead of the population curve.',
    },
    'blog-why-central-texas-mosquitoes-getting-worse': {
        'title': 'Why Central Texas Mosquitoes Are Getting Worse | GreenGuard USA',
        'desc':  'Warming temperatures, more rainfall, and urban growth are driving more mosquitoes in Central Texas. What\'s happening and how to respond.',
    },
    'blog-why-your-pool-area-deserves-better': {
        'title': 'Why Your Pool Area Deserves Better Mosquito Control | GreenGuard USA',
        'desc':  'Pools attract mosquitoes and spray programs risk contaminating the water. CO2 trapping is the safe, effective solution for Austin pool owners.',
    },
    'blog-worst-mosquito-breeding-spots-austin': {
        'title': 'The Worst Mosquito Breeding Spots in Austin | GreenGuard USA',
        'desc':  'Austin properties have hidden mosquito breeding sites. A guide to finding and eliminating the worst offenders before they hatch.',
    },
    'freetrial': {
        'title': 'Free Mosquito Control Trial | GreenGuard USA',
        'desc':  'Try GreenGuard USA risk-free. Book a free property assessment and see CO2 trapping work on your property.',
    },
    'results': {
        'title': 'Mosquito Control Results | GreenGuard USA Customer Stories',
        'desc':  'Real results from GreenGuard USA customers across Austin, TX. See how CO2 trapping transformed their outdoor living.',
    },
    'case-studies': {
        'title': 'Mosquito Control Case Studies | GreenGuard USA',
        'desc':  'In-depth case studies from GreenGuard USA. Real properties, real results, real data on CO2 mosquito trap performance.',
    },
    'team': {
        'title': 'GreenGuard USA Team | Austin Mosquito Control Experts',
        'desc':  'Meet the GreenGuard USA team. Certified mosquito control specialists serving Austin and surrounding areas.',
    },
    'barrier': {
        'title': 'Barrier vs CO2 Traps | Mosquito Control Comparison | GreenGuard USA',
        'desc':  'How CO2 trapping compares to barrier spray programs. Effectiveness, safety, and long-term outdoor protection.',
    },
    'larvicide': {
        'title': 'Larvicide vs CO2 Trapping | Mosquito Control | GreenGuard USA',
        'desc':  'How CO2 trapping compares to larvicide treatments. GreenGuard USA explains the difference and why trapping wins.',
    },
    'trapplacement': {
        'title': 'Mosquito Trap Placement Guide | GreenGuard USA',
        'desc':  'Where to place your CO2 mosquito trap for maximum effectiveness. GreenGuard USA placement guide for Austin properties.',
    },
    'eco-friendly-mosquito-control': {
        'title': 'Eco-Friendly Mosquito Control Austin TX | GreenGuard USA',
        'desc':  'Pesticide-free mosquito control using CO2 traps. Safe for bees, butterflies, kids, and pets. GreenGuard USA serves Austin, TX.',
    },
    'bee-safe-mosquito-control': {
        'title': 'Bee-Safe Mosquito Control Austin TX | GreenGuard USA',
        'desc':  'Mosquito control that does not harm pollinators. CO2 trap technology targets only mosquitoes. GreenGuard USA, Austin TX.',
    },
    'mosquito-science': {
        'title': 'The Science of CO2 Mosquito Trapping | GreenGuard USA',
        'desc':  'How CO2 mosquito traps work, the science behind them, and why they outperform sprays for long-term population reduction.',
    },
    'why-co2-mosquito-traps-work': {
        'title': 'Why CO2 Mosquito Traps Work | GreenGuard USA',
        'desc':  'The science behind CO2 mosquito trapping: how traps mimic human breath, attract and capture mosquitoes without pesticides.',
    },
    'co2-traps-vs-mosquito-spraying': {
        'title': 'CO2 Traps vs Mosquito Spraying | GreenGuard USA',
        'desc':  'A direct comparison of CO2 trap-based control vs traditional mosquito spraying. Safety, effectiveness, and long-term results.',
    },
    'how-far-do-mosquitoes-travel-texas': {
        'title': 'How Far Do Mosquitoes Travel in Texas? | GreenGuard USA',
        'desc':  'Understanding mosquito range in Texas and why it matters for trap placement and property protection.',
    },
    'mosquito-control-without-spraying': {
        'title': 'Mosquito Control Without Spraying | GreenGuard USA',
        'desc':  'Effective mosquito control in Austin without pesticide sprays. CO2 trapping eliminates mosquitoes at the source.',
    },
    'outdoor-wellness': {
        'title': 'Outdoor Wellness Starts with Mosquito Control | GreenGuard USA',
        'desc':  'Reclaim your outdoor space. GreenGuard USA makes outdoor living comfortable, pesticide-free, and year-round in Austin, TX.',
    },
    'pesticide-free-outdoor-living': {
        'title': 'Pesticide-Free Outdoor Living Austin TX | GreenGuard USA',
        'desc':  'Enjoy your yard without pesticides. CO2 trap mosquito control keeps your outdoor space safe for the whole family.',
    },
    'mosquito-control-westlake-hills': {
        'title': 'Mosquito Control Westlake Hills TX | GreenGuard USA',
        'desc':  'CO2 trap mosquito control for Westlake Hills properties. Pesticide-free, pollinator-safe, and effective along the Barton Creek greenbelt.',
    },
    'mosquito-control-lakeway': {
        'title': 'Mosquito Control Lakeway TX | GreenGuard USA',
        'desc':  'CO2 trap mosquito control for Lakeway and Lake Travis waterfront properties. Pesticide-free, Biogents-certified service.',
    },
    'mosquito-control-bee-cave': {
        'title': 'Mosquito Control Bee Cave TX | GreenGuard USA',
        'desc':  'CO2 trap mosquito control for Bee Cave and the Hill Country 620 corridor. No sprays, no chemicals.',
    },
    'mosquito-control-dripping-springs': {
        'title': 'Mosquito Control Dripping Springs TX | GreenGuard USA',
        'desc':  'CO2 trap mosquito control for Dripping Springs. Hill Country event venues and homeowners served. Pesticide-free.',
    },
    'mosquito-control-steiner-ranch': {
        'title': 'Mosquito Control Steiner Ranch Austin TX | GreenGuard USA',
        'desc':  'CO2 trap mosquito control for Steiner Ranch. Greenbelt interface properties and HOA communities served.',
    },
    'mosquito-control-round-rock': {
        'title': 'Mosquito Control Round Rock TX | GreenGuard USA',
        'desc':  'CO2 trap mosquito control for Round Rock and the Brushy Creek corridor. Pesticide-free, pollinator-safe.',
    },
    'mosquito-control-georgetown': {
        'title': 'Mosquito Control Georgetown TX | GreenGuard USA',
        'desc':  'CO2 trap mosquito control for Georgetown TX. San Gabriel River corridor and Sun City communities served.',
    },
    'mosquito-control-cedar-park': {
        'title': 'Mosquito Control Cedar Park TX | GreenGuard USA',
        'desc':  'CO2 trap mosquito control for Cedar Park. Brushy Creek trail corridor and suburban communities served.',
    },
    'mosquito-control-pflugerville': {
        'title': 'Mosquito Control Pflugerville TX | GreenGuard USA',
        'desc':  'CO2 trap mosquito control for Pflugerville. Lake Pflugerville and Gilleland Creek properties served.',
    },
    'mosquito-control-kyle': {
        'title': 'Mosquito Control Kyle TX | GreenGuard USA',
        'desc':  'CO2 trap mosquito control for Kyle TX. Blanco River watershed and fast-growing suburban communities served.',
    },
    'mosquito-control-buda': {
        'title': 'Mosquito Control Buda TX | GreenGuard USA',
        'desc':  'CO2 trap mosquito control for Buda TX. Onion Creek corridor and South Austin area homeowners served.',
    },
    'mosquito-control-leander': {
        'title': 'Mosquito Control Leander TX | GreenGuard USA',
        'desc':  'CO2 trap mosquito control for Leander TX. Balcones Canyonlands and Lake Travis edge communities served.',
    },
    'mosquito-control-liberty-hill': {
        'title': 'Mosquito Control Liberty Hill TX | GreenGuard USA',
        'desc':  'CO2 trap mosquito control for Liberty Hill TX. Rural acreage and San Gabriel headwaters properties served.',
    },
    'mosquito-control-luxury-homes': {
        'title': 'Mosquito Control for Luxury Homes Austin TX | GreenGuard USA',
        'desc':  'Premium CO2 trap mosquito control for luxury properties in Austin. Discreet, effective, pesticide-free protection.',
    },
    'mosquito-control-lakefront-homes-austin': {
        'title': 'Mosquito Control for Lakefront Homes Austin TX | GreenGuard USA',
        'desc':  'Specialized CO2 mosquito trap service for Lake Travis and Austin lakefront properties. No pesticides near the water.',
    },
    'mosquito-control-pollinator-gardens': {
        'title': 'Mosquito Control for Pollinator Gardens | GreenGuard USA',
        'desc':  'Eliminate mosquitoes without harming bees or butterflies. CO2 trap control is safe for native plants and pollinators.',
    },
    'mosquito-control-country-clubs': {
        'title': 'Mosquito Control for Country Clubs | GreenGuard USA',
        'desc':  'Commercial CO2 trap mosquito control for country clubs and private clubs. No pesticide odor, no spray schedule disruptions.',
    },
    'mosquito-control-golf-clubs': {
        'title': 'Mosquito Control for Golf Courses | GreenGuard USA',
        'desc':  'CO2 trap mosquito control for golf courses and clubs. Protect players and staff without pesticide programs.',
    },
    'mosquito-control-outdoor-restaurants': {
        'title': 'Mosquito Control for Outdoor Restaurants | GreenGuard USA',
        'desc':  'Keep restaurant patios mosquito-free without sprays or odors. CO2 trap service for Austin dining establishments.',
    },
    'mosquito-control-resorts': {
        'title': 'Mosquito Control for Resorts | GreenGuard USA',
        'desc':  'Resort-grade CO2 mosquito trap programs. Protect guests outdoors without pesticides or scheduled spray windows.',
    },
    'mosquito-control-wedding-venues': {
        'title': 'Mosquito Control for Wedding Venues | GreenGuard USA',
        'desc':  'Ensure guest comfort at outdoor wedding venues with CO2 mosquito trapping. No sprays, no odor, no disruption.',
    },
    'mosquito-control-wineries': {
        'title': 'Mosquito Control for Wineries | GreenGuard USA',
        'desc':  'Protect winery tasting rooms and outdoor events with CO2 mosquito traps. Pesticide-free, pollinator-safe.',
    },
}

# Build pattern for service area and blog pages not in the explicit table
SERVICE_AREA_RE = re.compile(r'^mosquito-control-(.+)$')
BLOG_RE         = re.compile(r'^blog-(.+)$')

def slug_to_seo(slug):
    """Generate fallback title/desc from slug for pages not in SEO table."""
    m = SERVICE_AREA_RE.match(slug)
    if m:
        city = m.group(1).replace('-', ' ').title()
        return {
            'title': f'Mosquito Control {city} TX | GreenGuard USA',
            'desc':  f'CO2 trap-based mosquito control in {city}, TX. Pesticide-free, pollinator-safe, effective outdoor protection.',
        }
    m = BLOG_RE.match(slug)
    if m:
        topic = m.group(1).replace('-', ' ').title()
        return {
            'title': f'{topic} | GreenGuard USA',
            'desc':  f'GreenGuard USA: {topic.lower()}. Expert advice on pesticide-free mosquito control in Austin, TX.',
        }
    name = slug.replace('-', ' ').title()
    return {
        'title': f'{name} | GreenGuard USA',
        'desc':  'GreenGuard USA provides eco-friendly CO2 trap-based mosquito control in Austin, TX and surrounding areas.',
    }

# ── Regex helpers ────────────────────────────────────────────────────────────
STYLE_RE        = re.compile(r'<style[^>]*>.*?</style>', re.DOTALL | re.IGNORECASE)
FONT_LINK_RE    = re.compile(r'<link[^>]*fonts\.googleapis[^>]*/?\s*>', re.IGNORECASE)
TIDIO_BROKEN_RE = re.compile(
    r'(<\/script>)' + re.escape(TIDIO_KEY) + r'\.js" async><\/script>',
    re.IGNORECASE
)

def strip_tags(html):
    return re.sub(r'<[^>]+>', '', html).strip()

def extract_og_text(html, tag):
    m = re.search(rf'<{tag}[^>]*>(.*?)</{tag}>', html, re.DOTALL | re.IGNORECASE)
    return strip_tags(m.group(1)).strip()[:120] if m else ''

def convert(fname, fragment):
    slug = fname[:-5]  # strip .html
    seo  = SEO.get(slug) or slug_to_seo(slug)

    # Fix broken Tidio tag (artifact from Squarespace code injection stripping)
    fragment = TIDIO_BROKEN_RE.sub(r'\1', fragment)

    # Extract styles (will go in <head>)
    styles = STYLE_RE.findall(fragment)
    body   = STYLE_RE.sub('', fragment)
    body   = FONT_LINK_RE.sub('', body)

    # Generate fallback title/desc from page content if needed
    title = seo.get('title') or (extract_og_text(body, 'h1') + ' | GreenGuard USA')
    desc  = seo.get('desc')  or extract_og_text(body, 'p')  or 'GreenGuard USA provides eco-friendly CO2 mosquito control in Austin, TX.'

    canonical_path = seo.get('slug', f'/{slug}')
    canonical      = BASE_URL + canonical_path

    style_block = '\n  '.join(styles)

    return f'''<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{title}</title>
  <meta name="description" content="{desc}">
  <link rel="canonical" href="{canonical}">
  <style>*{{box-sizing:border-box}}body{{margin:0;padding:0;background:#1a2e1f}}</style>
  {GOOGLE_FONTS_LINK}
  {style_block}
  <script async src="https://www.googletagmanager.com/gtag/js?id={GA4_ID}"></script>
  <script>window.dataLayer=window.dataLayer||[];function gtag(){{dataLayer.push(arguments)}}gtag('js',new Date());gtag('config','{GA4_ID}');</script>
  <script src="{TIDIO_SRC}" async></script>
</head>
<body>
{body.strip()}
</body>
</html>'''


def main():
    # Clean and recreate out/
    if os.path.exists(OUT):
        shutil.rmtree(OUT)
    os.makedirs(OUT)

    converted = 0
    skipped   = []

    for fname in sorted(os.listdir(REPO)):
        if not fname.endswith('.html'):
            continue

        path     = os.path.join(REPO, fname)
        fragment = open(path, encoding='utf-8').read()

        # Already a full HTML doc — copy as-is
        if fragment.lstrip().startswith('<!DOCTYPE'):
            shutil.copy(path, os.path.join(OUT, fname))
            print(f'  COPY  {fname}')
            continue

        full = convert(fname, fragment)
        open(os.path.join(OUT, fname), 'w', encoding='utf-8').write(full)
        print(f'  BUILD {fname}')
        converted += 1

    # Create index.html from lander.html (home page)
    lander_out = os.path.join(OUT, 'lander.html')
    index_out  = os.path.join(OUT, 'index.html')
    if os.path.exists(lander_out) and not os.path.exists(index_out):
        shutil.copy(lander_out, index_out)
        print(f'  INDEX index.html <- lander.html')

    # Copy non-HTML assets that Vercel should also serve
    asset_exts = {'.json', '.js', '.css', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.pdf', '.ico', '.txt'}
    for fname in os.listdir(REPO):
        ext = os.path.splitext(fname)[1].lower()
        if ext in asset_exts and not fname.startswith('.'):
            src = os.path.join(REPO, fname)
            dst = os.path.join(OUT, fname)
            if os.path.isfile(src):
                shutil.copy(src, dst)

    print(f'\nBuilt {converted} pages -> out/')
    if skipped:
        print('Skipped:', skipped)


if __name__ == '__main__':
    main()

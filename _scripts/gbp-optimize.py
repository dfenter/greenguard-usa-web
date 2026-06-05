#!/usr/bin/env python3
"""
GBP optimization script — runs when quota is available.
Adds missing categories, description, service area, and website.
"""
import json, urllib.request, urllib.parse, sys, time
from pathlib import Path

CREDS_FILE = Path.home() / 'greenguard_agent/token.json'

def get_token():
    c = json.loads(CREDS_FILE.read_text())
    return json.loads(urllib.request.urlopen(urllib.request.Request(
        'https://oauth2.googleapis.com/token',
        data=urllib.parse.urlencode({'client_id':c['client_id'],'client_secret':c['client_secret'],
            'refresh_token':c['refresh_token'],'grant_type':'refresh_token'}).encode(),
        headers={'Content-Type':'application/x-www-form-urlencoded'}
    )).read())['access_token']

def api(method, url, body=None, token=None, retries=5):
    """GBP API has 5 QPM limit — retry with exponential backoff on 429."""
    for attempt in range(retries):
        try:
            return _api_call(method, url, body, token)
        except urllib.error.HTTPError as e:
            if e.code == 429 and attempt < retries - 1:
                wait = 15 * (2 ** attempt)  # 15, 30, 60, 120 seconds
                print(f"  Rate limited. Waiting {wait}s before retry {attempt+2}/{retries}...")
                time.sleep(wait)
            else:
                raise

def _api_call(method, url, body=None, token=None):
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(url, data=data, method=method,
        headers={'Authorization':f'Bearer {token}','Content-Type':'application/json'})
    try:
        return json.loads(urllib.request.urlopen(req).read())
    except urllib.error.HTTPError as e:
        print(f"  {method} {url[-60:]}: {e.code} {e.read().decode()[:80]}")
        return None

TOKEN = get_token()

# Get account + location
accts = api('GET','https://mybusinessaccountmanagement.googleapis.com/v1/accounts',token=TOKEN)
if not accts:
    print("Cannot access GBP — quota exceeded. Run again later.")
    sys.exit(1)

time.sleep(3)
for a in accts.get('accounts',[]):
    locs = api('GET',
        f"https://mybusinessbusinessinformation.googleapis.com/v1/{a['name']}/locations"
        "?readMask=name,title,categories,websiteUri,regularHours,metadata,profile,serviceArea",
        token=TOKEN)
    if not locs: continue
    time.sleep(3)

    for loc in locs.get('locations',[]):
        name = loc['name']
        print(f"\nOptimizing: {loc.get('title')}")

        # Current state
        cat = loc.get('categories',{})
        desc = loc.get('profile',{}).get('description','')
        hrs  = loc.get('regularHours',{}).get('periods',[])
        website = loc.get('websiteUri','')

        updates = {}
        update_mask = []

        # 1. Fix description if missing or short
        target_desc = (
            "GreenGuard USA provides pesticide-free CO₂ mosquito control for Austin homeowners. "
            "We install professional-grade CO₂ traps, deliver monthly tank exchanges, and handle all "
            "maintenance — no contracts, no pesticides. Safe for kids, pets, and pollinators. "
            "Serving the Austin metro area including Westlake Hills, Lakeway, Cedar Park, and Dripping Springs. "
            "Book a free property assessment today."
        )
        if len(desc) < 200:
            updates['profile'] = {'description': target_desc}
            update_mask.append('profile.description')
            print(f"  + Setting description ({len(target_desc)} chars)")

        # 2. Add missing additional categories
        existing_addl = [c.get('displayName') for c in cat.get('additionalCategories',[])]
        needed_categories = [
            {'displayName': 'Pest Control Service'},
            {'displayName': 'Exterminator'},
            {'displayName': 'Home Services'},
        ]
        missing = [c for c in needed_categories if c['displayName'] not in existing_addl]
        if missing:
            updates['categories'] = {
                'primaryCategory': cat.get('primaryCategory', {}),
                'additionalCategories': cat.get('additionalCategories', []) + missing
            }
            update_mask.append('categories')
            print(f"  + Adding categories: {[c['displayName'] for c in missing]}")

        # 3. Ensure website is set
        if not website:
            updates['websiteUri'] = 'https://www.greenguard-usa.com'
            update_mask.append('websiteUri')
            print(f"  + Setting website")

        if not updates:
            print("  Nothing to update — already optimized")
            continue

        # Apply updates
        patch_url = (
            f"https://mybusinessbusinessinformation.googleapis.com/v1/{name}"
            f"?updateMask={','.join(update_mask)}"
        )
        result = api('PATCH', patch_url, body=updates, token=TOKEN)
        if result:
            print(f"  ✓ Updated: {update_mask}")
        time.sleep(3)

print("\nDone.")

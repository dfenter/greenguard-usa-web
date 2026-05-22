#!/usr/bin/env python3
"""
Fetches Google reviews via Places API (New) and merges with manually curated reviews.
Updates only the 'google' section of reviews.json — manual/Nextdoor entries preserved.
"""
import json, os, urllib.request, urllib.error, sys

API_KEY  = os.environ.get('GOOGLE_API_KEY', '')
PLACE_ID = 'ChIJx8wLC4K11wwRbfe7hhZiHXs'

if not API_KEY:
    print("ERROR: GOOGLE_API_KEY environment variable not set.")
    sys.exit(1)

url = f'https://places.googleapis.com/v1/places/{PLACE_ID}'
fields = 'id,displayName,rating,userRatingCount,reviews'

req = urllib.request.Request(
    url,
    headers={
        'X-Goog-Api-Key': API_KEY,
        'X-Goog-FieldMask': fields,
    },
)

print(f"Fetching reviews for Place ID {PLACE_ID}...")
try:
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read())
except urllib.error.HTTPError as e:
    body = e.read().decode()
    print(f"HTTP {e.code}: {body}")
    sys.exit(1)

reviews = []
for r in data.get('reviews', []):
    reviews.append({
        'author': r.get('authorAttribution', {}).get('displayName', ''),
        'rating': r.get('rating', 5),
        'text':   r.get('text', {}).get('text', ''),
        'time':   r.get('relativePublishTimeDescription', ''),
        'source': 'google',
    })

google_block = {
    'place_id': data.get('id', PLACE_ID),
    'rating':   data.get('rating', 0),
    'total':    data.get('userRatingCount', 0),
    'reviews':  reviews,
}

reviews_path = os.path.join(os.path.dirname(__file__), '..', 'reviews.json')
existing = {}
if os.path.exists(reviews_path):
    with open(reviews_path) as f:
        existing = json.load(f)

existing['google'] = google_block

with open(reviews_path, 'w') as f:
    json.dump(existing, f, indent=2)

print(f"Done. {len(reviews)} reviews fetched. Rating: {google_block['rating']} ({google_block['total']} total)")

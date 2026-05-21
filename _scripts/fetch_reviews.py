#!/usr/bin/env python3
"""
Fetches Google reviews via Places API and merges with manually curated reviews.
Updates only the 'google' section of reviews.json — manual/Nextdoor entries preserved.
"""
import json, os, urllib.request, sys

API_KEY  = os.environ.get('GOOGLE_MAPS_API_KEY', '')
PLACE_ID = 'ChIJx8wLC4K11wwRbfe7hhZiHXs'

if not API_KEY:
    print("ERROR: GOOGLE_MAPS_API_KEY environment variable not set.")
    sys.exit(1)

url = (
    'https://maps.googleapis.com/maps/api/place/details/json'
    f'?place_id={PLACE_ID}'
    '&fields=place_id,name,rating,user_ratings_total,reviews'
    f'&key={API_KEY}'
    '&reviews_sort=newest'
)

print(f"Fetching reviews for Place ID {PLACE_ID}...")
with urllib.request.urlopen(url) as resp:
    data = json.loads(resp.read())

if data.get('status') != 'OK':
    print(f"API error: {data.get('status')} — {data.get('error_message', '')}")
    sys.exit(1)

result = data['result']
reviews = []
for r in result.get('reviews', []):
    reviews.append({
        'author': r.get('author_name', ''),
        'rating': r.get('rating', 5),
        'text':   r.get('text', ''),
        'time':   r.get('relative_time_description', ''),
        'source': 'google'
    })

google_block = {
    'place_id': result.get('place_id', PLACE_ID),
    'rating':   result.get('rating', 0),
    'total':    result.get('user_ratings_total', 0),
    'reviews':  reviews
}

reviews_path = 'reviews.json'
existing = {}
if os.path.exists(reviews_path):
    with open(reviews_path) as f:
        existing = json.load(f)

existing['google'] = google_block

with open(reviews_path, 'w') as f:
    json.dump(existing, f, indent=2)

print(f"Done. {len(reviews)} reviews fetched. Rating: {google_block['rating']} ({google_block['total']} total)")

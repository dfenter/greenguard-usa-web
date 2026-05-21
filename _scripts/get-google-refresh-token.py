#!/usr/bin/env python3
"""
One-time script to get a Google OAuth refresh token for the GreenGuard portal.
Run this once on your Mac. It opens your browser, you sign in as
admin@greenguard-usa.com, and it prints the refresh token to store in Vercel.

No pip installs required — uses only Python built-in libraries.

Usage:
  python3 _scripts/get-google-refresh-token.py
"""
import json
import os
import sys
import urllib.parse
import urllib.request
import webbrowser
from http.server import HTTPServer, BaseHTTPRequestHandler
from threading import Thread

# ── Paste your OAuth Client ID and Secret here after creating them ───────────
# Steps to get these (takes 2 minutes):
#   1. console.cloud.google.com → APIs & Services → Credentials
#   2. Create Credentials → OAuth 2.0 Client ID → Desktop app → Create
#   3. Copy the Client ID and Client Secret shown
CLIENT_ID     = os.environ.get('GOOGLE_CLIENT_ID', '')
CLIENT_SECRET = os.environ.get('GOOGLE_CLIENT_SECRET', '')
# ─────────────────────────────────────────────────────────────────────────────

REDIRECT_URI = 'http://localhost:8765'
SCOPE = 'https://www.googleapis.com/auth/calendar.readonly'

auth_code = None

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        global auth_code
        params = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        auth_code = params.get('code', [None])[0]
        self.send_response(200)
        self.send_header('Content-Type', 'text/html')
        self.end_headers()
        self.wfile.write(b'''
            <html><body style="font-family:sans-serif;padding:40px;background:#1a2e1f;color:#d4e6ca">
            <h2 style="color:#7dffaa">Authorized!</h2>
            <p>You can close this window and go back to Terminal.</p>
            </body></html>
        ''')

    def log_message(self, *args):
        pass  # silence request logs


def main():
    if not CLIENT_ID or not CLIENT_SECRET:
        print("""
ERROR: CLIENT_ID and CLIENT_SECRET are not set.

Get them in 2 minutes:
  1. Go to console.cloud.google.com/apis/credentials
  2. Click Create Credentials → OAuth 2.0 Client ID
  3. Application type: Desktop app → name it 'GreenGuard Portal' → Create
  4. Copy the Client ID and Client Secret

Then run:
  GOOGLE_CLIENT_ID=your-id GOOGLE_CLIENT_SECRET=your-secret python3 _scripts/get-google-refresh-token.py
""")
        sys.exit(1)

    # Build auth URL
    params = urllib.parse.urlencode({
        'client_id': CLIENT_ID,
        'redirect_uri': REDIRECT_URI,
        'response_type': 'code',
        'scope': SCOPE,
        'access_type': 'offline',
        'prompt': 'consent',  # force refresh token to be returned
    })
    auth_url = f'https://accounts.google.com/o/oauth2/v2/auth?{params}'

    # Start local server to catch the redirect
    server = HTTPServer(('localhost', 8765), Handler)
    thread = Thread(target=server.handle_request)
    thread.start()

    print('\nOpening browser for Google sign-in...')
    print('Sign in as admin@greenguard-usa.com\n')
    webbrowser.open(auth_url)

    thread.join(timeout=120)
    server.server_close()

    if not auth_code:
        print('ERROR: No auth code received. Did you complete sign-in?')
        sys.exit(1)

    # Exchange code for tokens
    token_data = urllib.parse.urlencode({
        'code': auth_code,
        'client_id': CLIENT_ID,
        'client_secret': CLIENT_SECRET,
        'redirect_uri': REDIRECT_URI,
        'grant_type': 'authorization_code',
    }).encode()

    req = urllib.request.Request(
        'https://oauth2.googleapis.com/token',
        data=token_data,
        headers={'Content-Type': 'application/x-www-form-urlencoded'},
    )
    with urllib.request.urlopen(req) as resp:
        tokens = json.loads(resp.read())

    refresh_token = tokens.get('refresh_token')
    if not refresh_token:
        print('ERROR: No refresh token returned. Make sure you used prompt=consent.')
        sys.exit(1)

    print('═' * 60)
    print('  SUCCESS — copy these 3 values into Vercel + GitHub')
    print('═' * 60)
    print()
    print(f'GOOGLE_CLIENT_ID     = {CLIENT_ID}')
    print(f'GOOGLE_CLIENT_SECRET = {CLIENT_SECRET}')
    print(f'GOOGLE_REFRESH_TOKEN = {refresh_token}')
    print()
    print('Add all three to:')
    print('  • Vercel dashboard → Environment Variables')
    print('  • GitHub → Settings → Secrets → Actions')
    print()


if __name__ == '__main__':
    main()

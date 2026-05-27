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

# Default: full calendar write access (needed for apply_route_times.py) + analytics
# + Google Business Profile.
# Pass --readonly to request only calendar.readonly (legacy behavior).
if '--readonly' in sys.argv:
    SCOPE = 'https://www.googleapis.com/auth/calendar.readonly'
    print('Requesting scope: Calendar (READ-ONLY)')
else:
    SCOPE = ' '.join([
        'https://www.googleapis.com/auth/calendar.events',
        'https://www.googleapis.com/auth/calendar.readonly',
        'https://www.googleapis.com/auth/analytics.readonly',
        'https://www.googleapis.com/auth/business.manage',
    ])
    print('Requesting scopes: Calendar events (read+write) + Analytics + Google Business Profile')
    print('(Run with --readonly to limit to read-only calendar access)')

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
    print('  SUCCESS — token issued')
    print('═' * 60)

    # ── 1. Save to macOS Keychain (canonical local source) ────────────────────
    import subprocess
    payload = json.dumps({
        'client_id': CLIENT_ID,
        'client_secret': CLIENT_SECRET,
        'refresh_token': refresh_token,
        'scopes': SCOPE.split(),
    })
    # Idempotent: delete-if-exists, then add
    subprocess.run(['security', 'delete-generic-password', '-a', 'greenguard',
                    '-s', 'greenguard-oauth'], capture_output=True)
    r = subprocess.run(['security', 'add-generic-password', '-a', 'greenguard',
                        '-s', 'greenguard-oauth', '-w', payload, '-U'],
                       capture_output=True)
    if r.returncode == 0:
        print('  ✓ saved to macOS Keychain (service=greenguard-oauth)')
    else:
        print(f'  ⚠ Keychain save failed: {r.stderr.decode()}')

    # ── 2. Update local agent token.json for backward compatibility ────────────
    agent_token = os.path.expanduser('~/greenguard_agent/token.json')
    if os.path.exists(os.path.dirname(agent_token)):
        try:
            with open(agent_token, 'w') as f:
                json.dump({
                    'token': tokens.get('access_token'),
                    'refresh_token': refresh_token,
                    'token_uri': 'https://oauth2.googleapis.com/token',
                    'client_id': CLIENT_ID,
                    'client_secret': CLIENT_SECRET,
                    'scopes': SCOPE.split(),
                }, f, indent=2)
            print(f'  ✓ updated {agent_token}')
        except Exception as e:
            print(f'  ⚠ agent token.json write failed: {e}')

    # ── 3. Push to Vercel (production) ─────────────────────────────────────────
    web_app = os.path.expanduser('~/greenguard-usa-web/app')
    if os.path.exists(web_app):
        for k, v in [('GOOGLE_REFRESH_TOKEN', refresh_token),
                     ('GOOGLE_CLIENT_ID', CLIENT_ID),
                     ('GOOGLE_CLIENT_SECRET', CLIENT_SECRET)]:
            tmpf = f'/tmp/.{k}.txt'
            with open(tmpf, 'w') as f: f.write(v)
            # remove existing (ignore errors), then add
            subprocess.run(['vercel', 'env', 'rm', k, 'production', '-y'],
                           cwd=web_app, capture_output=True)
            r = subprocess.run(['vercel', 'env', 'add', k, 'production'],
                               cwd=web_app, stdin=open(tmpf), capture_output=True)
            os.remove(tmpf)
            mark = '✓' if r.returncode == 0 else '⚠'
            print(f'  {mark} Vercel {k}')

    print()
    print('All three locations updated. The refresh token is now persistent across:')
    print('  • macOS Keychain → read by future helper scripts via lib/oauth_keychain.py')
    print('  • Local agent/token.json → for direct googleapiclient use')
    print('  • Vercel production env → portal API routes')
    print()
    print('Don\'t commit any of these files — they\'re already in .gitignore.')


if __name__ == '__main__':
    main()

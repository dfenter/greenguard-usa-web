"""
Loads Google OAuth credentials from macOS Keychain.

The OAuth refresh token + client creds are stored as a single Keychain entry:
  service: greenguard-oauth
  account: greenguard
  data:    {"client_id":..., "client_secret":..., "refresh_token":..., "scopes":[...]}

Usage from any helper script:

    from oauth_keychain import calendar_service
    cal = calendar_service()
    events = cal.events().list(calendarId='admin@greenguard-usa.com', ...).execute()

Falls back to env vars (GOOGLE_CLIENT_ID/SECRET/REFRESH_TOKEN) and finally to
~/greenguard_agent/token.json so existing scripts keep working.
"""
import json
import os
import subprocess


def load_creds_dict() -> dict:
    """Return a dict with client_id, client_secret, refresh_token, scopes."""
    # 1. Keychain (preferred)
    try:
        r = subprocess.run(
            ['security', 'find-generic-password', '-a', 'greenguard',
             '-s', 'greenguard-oauth', '-w'],
            capture_output=True, check=True,
        )
        return json.loads(r.stdout.decode().strip())
    except (subprocess.CalledProcessError, json.JSONDecodeError, FileNotFoundError):
        pass

    # 2. Env vars
    if all(os.getenv(k) for k in ('GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REFRESH_TOKEN')):
        return {
            'client_id':     os.environ['GOOGLE_CLIENT_ID'],
            'client_secret': os.environ['GOOGLE_CLIENT_SECRET'],
            'refresh_token': os.environ['GOOGLE_REFRESH_TOKEN'],
            'scopes': [
                'https://www.googleapis.com/auth/calendar.events',
                'https://www.googleapis.com/auth/calendar.readonly',
            ],
        }

    # 3. Legacy file
    legacy = os.path.expanduser('~/greenguard_agent/token.json')
    if os.path.exists(legacy):
        with open(legacy) as f:
            return json.load(f)

    raise RuntimeError(
        'No OAuth credentials found. Run:  '
        'python3 _scripts/get-google-refresh-token.py'
    )


def calendar_service():
    """Returns an authenticated googleapiclient calendar service."""
    from google.oauth2.credentials import Credentials
    from googleapiclient.discovery import build
    c = load_creds_dict()
    creds = Credentials(
        token=c.get('token'),
        refresh_token=c['refresh_token'],
        token_uri='https://oauth2.googleapis.com/token',
        client_id=c['client_id'],
        client_secret=c['client_secret'],
        scopes=c.get('scopes', ['https://www.googleapis.com/auth/calendar.events']),
    )
    return build('calendar', 'v3', credentials=creds)


def access_token() -> str:
    """Exchange the refresh token for a fresh access token via raw urllib."""
    import urllib.request
    import urllib.parse
    c = load_creds_dict()
    body = urllib.parse.urlencode({
        'client_id':     c['client_id'],
        'client_secret': c['client_secret'],
        'refresh_token': c['refresh_token'],
        'grant_type':    'refresh_token',
    }).encode()
    req = urllib.request.Request('https://oauth2.googleapis.com/token', data=body)
    return json.loads(urllib.request.urlopen(req).read())['access_token']

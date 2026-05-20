#!/usr/bin/env python3
"""
One-time setup: log in to biogentspro.com interactively (including any 2FA prompt)
and save the browser session for use by biogents_fulfillment.py.

Use this when biogentspro.com uses email or SMS 2FA that can't be automated with TOTP.
If your account uses an authenticator app, use BIOGENTS_TOTP_SECRET instead — no
setup script needed.

Usage (run locally, not in CI):
  BIOGENTS_USERNAME=you@example.com BIOGENTS_PASSWORD=secret \\
    python3 _scripts/biogents_setup_session.py

After the browser closes, copy the printed value into a GitHub secret named
BIOGENTS_SESSION. Re-run this script whenever the session expires and the
automation starts failing with authentication errors.
"""
import base64
import json
import os
import sys

from playwright.sync_api import sync_playwright

BIOGENTS_USERNAME = os.environ.get("BIOGENTS_USERNAME", "")
BIOGENTS_PASSWORD = os.environ.get("BIOGENTS_PASSWORD", "")
BIOGENTS_PORTAL   = "https://biogentspro.com"

if not BIOGENTS_USERNAME or not BIOGENTS_PASSWORD:
    print("ERROR: Set BIOGENTS_USERNAME and BIOGENTS_PASSWORD before running.")
    sys.exit(1)

print("Opening browser — complete any 2FA prompt in the window, then wait...")
print("Do NOT close the browser yourself; the script will close it when done.\n")

with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=False)
    ctx     = browser.new_context()
    page    = ctx.new_page()

    page.goto(f"{BIOGENTS_PORTAL}/my-account/", wait_until="domcontentloaded")

    # Fill credentials automatically.
    page.locator("input#username").fill(BIOGENTS_USERNAME)
    page.locator("input#password").fill(BIOGENTS_PASSWORD)
    page.locator("button[type=submit], input[type=submit]").first.click()

    print("Waiting for you to complete 2FA (up to 5 minutes)...")

    # Poll until we land on the account dashboard (login form no longer visible).
    page.wait_for_function(
        """() => {
            const form = document.querySelector('form#loginform');
            return !form && window.location.href.includes('/my-account/');
        }""",
        timeout=300_000,
    )
    page.wait_for_timeout(1_500)  # let the page fully settle

    if "/my-account/" not in page.url:
        print(f"ERROR: Login does not appear to have succeeded. Current URL: {page.url}")
        browser.close()
        sys.exit(1)

    state   = ctx.storage_state()
    encoded = base64.b64encode(json.dumps(state).encode()).decode()
    browser.close()

print("\nSession captured successfully!")
print("\n--- Copy everything below this line into a GitHub secret named BIOGENTS_SESSION ---\n")
print(encoded)
print("\n--- End of secret value ---")
print("\nThis session will remain valid until biogentspro.com expires it.")
print("Re-run this script and update the secret whenever authentication fails.")

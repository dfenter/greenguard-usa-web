"""Resend transactional email client for the agent.

One sender for every customer-facing email from the agent, replacing the
previous mix of Gmail-API direct sends. Stripe continues to handle its own
invoice/receipt/dunning emails — this is for agent-generated notifications
(appointment reminders, post-visit, review followup, winback drafts).

Required env: RESEND_API_KEY. Sender defaults to admin@greenguard-usa.com.
"""
from __future__ import annotations
import os
import json
import urllib.request
import urllib.error

DEFAULT_FROM = "GreenGuard USA <admin@greenguard-usa.com>"


def send_email(to: str, subject: str, html: str, plain: str | None = None,
               sender: str = DEFAULT_FROM, reply_to: str | None = None) -> bool:
    """Send via Resend. Returns True on success. Logs and returns False on failure
    so crons keep moving even if one recipient fails."""
    api_key = os.environ.get("RESEND_API_KEY")
    if not api_key:
        print(f"[resend] RESEND_API_KEY not set; skipping send to {to}")
        return False

    payload: dict = {
        "from": sender,
        "to": [to] if isinstance(to, str) else to,
        "subject": subject,
        "html": html,
    }
    if plain:
        payload["text"] = plain
    if reply_to:
        payload["reply_to"] = reply_to

    req = urllib.request.Request(
        "https://api.resend.com/emails",
        data=json.dumps(payload).encode(),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            resp.read()
        return True
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "replace")[:300]
        print(f"[resend] {e.code} sending to {to}: {body}")
        return False
    except Exception as e:
        print(f"[resend] error sending to {to}: {e}")
        return False

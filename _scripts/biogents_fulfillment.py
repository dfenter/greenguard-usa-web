#!/usr/bin/env python3
"""
Polls Squarespace Commerce for orders containing Biogents products and
automatically re-places them on biogentspro.com via Playwright.

Required env vars:
  SQUARESPACE_API_KEY   - Squarespace Developer API key (Commerce read scope)
  BIOGENTS_USERNAME     - Login email for biogentspro.com dealer portal
  BIOGENTS_PASSWORD     - Password for biogentspro.com dealer portal
  BIOGENTS_SHIP_TO      - JSON object: {"name","address1","city","state","zip","country"}
  BIOGENTS_PRODUCT_MAP  - JSON object mapping Squarespace SKU -> biogentspro.com product URL
                          e.g. '{"BG-GAT":"https://biogentspro.com/product/bg-gat/"}'

Optional env vars:
  NOTIFICATION_EMAIL    - Address to email on failures
  SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS  - SMTP config for failure emails
  STATE_FILE            - Path to state JSON (default: _data/processed_biogents_orders.json)
  DRY_RUN               - Set to "true" to log what would be ordered without actually ordering
"""
import json
import os
import smtplib
import sys
import urllib.request
import urllib.parse
from datetime import datetime, timezone
from email.mime.text import MIMEText

from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

SQUARESPACE_API_KEY = os.environ.get("SQUARESPACE_API_KEY", "")
BIOGENTS_USERNAME   = os.environ.get("BIOGENTS_USERNAME", "")
BIOGENTS_PASSWORD   = os.environ.get("BIOGENTS_PASSWORD", "")
BIOGENTS_SHIP_TO    = json.loads(os.environ.get("BIOGENTS_SHIP_TO", "{}"))
BIOGENTS_PORTAL     = "https://biogentspro.com"
DRY_RUN             = os.environ.get("DRY_RUN", "").lower() == "true"
STATE_FILE          = os.environ.get("STATE_FILE", "_data/processed_biogents_orders.json")
NOTIFICATION_EMAIL  = os.environ.get("NOTIFICATION_EMAIL", "")

# Maps Squarespace SKU -> biogentspro.com product page URL.
# Populate via BIOGENTS_PRODUCT_MAP env var or edit the dict below.
# Example: {"BG-GAT": "https://biogentspro.com/product/bg-gat/"}
_raw_product_map = os.environ.get("BIOGENTS_PRODUCT_MAP", "{}")
PRODUCT_MAP: dict[str, str] = json.loads(_raw_product_map)

SQUARESPACE_ORDERS_URL = "https://api.squarespace.com/1.0/commerce/orders"
MAX_RETRIES = 3  # attempts per order before marking it permanently failed


# ---------------------------------------------------------------------------
# State helpers
# ---------------------------------------------------------------------------

def load_state() -> dict:
    if os.path.exists(STATE_FILE):
        with open(STATE_FILE) as f:
            return json.load(f)
    return {"last_checked": None, "processed_orders": []}


def save_state(state: dict) -> None:
    os.makedirs(os.path.dirname(STATE_FILE), exist_ok=True)
    with open(STATE_FILE, "w") as f:
        json.dump(state, f, indent=2)


def processed_ids(state: dict) -> set[str]:
    return {o["squarespace_order_id"] for o in state.get("processed_orders", [])}


# ---------------------------------------------------------------------------
# Squarespace client
# ---------------------------------------------------------------------------

def fetch_orders(since_iso: str | None) -> list[dict]:
    params: dict[str, str] = {"fulfillmentStatus": "PENDING"}
    if since_iso:
        params["modifiedAfter"] = since_iso

    url = SQUARESPACE_ORDERS_URL + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(
        url,
        headers={
            "Authorization": f"Bearer {SQUARESPACE_API_KEY}",
            "User-Agent": "GreenGuard-Biogents-Fulfillment/1.0",
        },
    )
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read())

    orders = data.get("result", [])
    # Follow pagination if present
    cursor = data.get("pagination", {}).get("nextPageCursor")
    while cursor:
        paged_url = SQUARESPACE_ORDERS_URL + "?" + urllib.parse.urlencode({**params, "cursor": cursor})
        req = urllib.request.Request(
            paged_url,
            headers={"Authorization": f"Bearer {SQUARESPACE_API_KEY}"},
        )
        with urllib.request.urlopen(req) as resp:
            page = json.loads(resp.read())
        orders.extend(page.get("result", []))
        cursor = page.get("pagination", {}).get("nextPageCursor")

    return orders


def is_biogents_item(line_item: dict) -> bool:
    sku  = (line_item.get("sku") or "").upper()
    name = (line_item.get("productName") or "").lower()
    return sku.startswith("BG-") or "biogents" in name


def biogents_items(order: dict) -> list[dict]:
    return [li for li in order.get("lineItems", []) if is_biogents_item(li)]


# ---------------------------------------------------------------------------
# Playwright buyer
# ---------------------------------------------------------------------------

class BiogentsBuyer:
    """Headless browser session for biogentspro.com dealer portal."""

    def __init__(self, playwright):
        self._pw = playwright
        self._browser = playwright.chromium.launch(headless=True)
        self._ctx = self._browser.new_context()
        self._page = self._ctx.new_page()
        self._logged_in = False

    def close(self):
        self._browser.close()

    def login(self) -> None:
        if self._logged_in:
            return
        page = self._page
        page.goto(f"{BIOGENTS_PORTAL}/my-account/", wait_until="domcontentloaded")

        # If already redirected to dashboard, we're logged in via saved session.
        if "/my-account/" in page.url and page.locator("form#loginform").count() == 0:
            self._logged_in = True
            return

        page.locator("input#username").fill(BIOGENTS_USERNAME)
        page.locator("input#password").fill(BIOGENTS_PASSWORD)
        page.locator("button[type=submit], input[type=submit]").first.click()
        page.wait_for_url(f"{BIOGENTS_PORTAL}/**", timeout=15_000)

        if "/my-account/" not in page.url:
            raise RuntimeError(f"Login failed — redirected to {page.url}")
        self._logged_in = True
        print("Logged in to biogentspro.com")

    def place_order(self, sku: str, quantity: int, squarespace_order_id: str) -> str:
        """Navigate to the product, set quantity, add to cart, and check out.
        Returns the biogentspro.com confirmation order number."""
        product_url = PRODUCT_MAP.get(sku)
        if not product_url:
            raise ValueError(
                f"No product URL mapped for SKU '{sku}'. "
                "Add it to BIOGENTS_PRODUCT_MAP env var."
            )

        self.login()
        page = self._page

        print(f"  Navigating to product page for {sku}: {product_url}")
        page.goto(product_url, wait_until="domcontentloaded")

        # Set quantity (standard WooCommerce/Shopify input field patterns)
        qty_input = page.locator("input.qty, input[name='quantity'], input[type='number'][name*='qty']").first
        qty_input.fill(str(quantity))

        # Add to cart
        page.locator(
            "button.single_add_to_cart_button, "
            "button[name='add-to-cart'], "
            "button.add_to_cart_button, "
            "[data-action='add-to-cart']"
        ).first.click()

        # Proceed to checkout (works for WooCommerce; adjust if different platform)
        page.wait_for_timeout(1_500)  # brief pause for cart animation
        page.goto(f"{BIOGENTS_PORTAL}/checkout/", wait_until="domcontentloaded")

        # If a shipping address form appears, fill it.
        addr_field = page.locator("input#shipping_address_1")
        if addr_field.count() > 0 and BIOGENTS_SHIP_TO:
            ship = BIOGENTS_SHIP_TO
            page.locator("input#shipping_first_name").fill(ship.get("name", "").split()[0])
            page.locator("input#shipping_last_name").fill(" ".join(ship.get("name", "").split()[1:]))
            addr_field.fill(ship.get("address1", ""))
            page.locator("input#shipping_city").fill(ship.get("city", ""))
            page.locator("select#shipping_state").select_option(label=ship.get("state", ""))
            page.locator("input#shipping_postcode").fill(ship.get("zip", ""))

        # Place order
        place_btn = page.locator(
            "#place_order, "
            "button[id*='place_order'], "
            "button[name*='place_order'], "
            "input[name='checkout_place_order']"
        ).first
        place_btn.click()

        # Wait for confirmation page
        try:
            page.wait_for_url(f"{BIOGENTS_PORTAL}/*order*", timeout=30_000)
        except PWTimeout:
            # Some portals stay on same URL and show inline confirmation
            pass

        # Extract order confirmation number
        conf_locator = page.locator(
            ".woocommerce-order-overview__order strong, "
            "li.order strong, "
            "[class*='order-number'] strong, "
            "[class*='confirmation'] .order-number"
        )
        if conf_locator.count() > 0:
            conf_number = conf_locator.first.inner_text().strip()
        else:
            # Fallback: scrape any visible order number from the page text
            text = page.inner_text("body")
            import re
            match = re.search(r"order\s*#?\s*(\d+)", text, re.IGNORECASE)
            conf_number = match.group(1) if match else f"UNKNOWN-{squarespace_order_id}"

        print(f"  Placed biogentspro order #{conf_number} for SS order {squarespace_order_id}")
        return conf_number


# ---------------------------------------------------------------------------
# Notifications
# ---------------------------------------------------------------------------

def send_failure_notification(squarespace_order_id: str, error: str) -> None:
    if not NOTIFICATION_EMAIL:
        return
    smtp_host = os.environ.get("SMTP_HOST", "smtp.gmail.com")
    smtp_port = int(os.environ.get("SMTP_PORT", "587"))
    smtp_user = os.environ.get("SMTP_USER", "")
    smtp_pass = os.environ.get("SMTP_PASS", "")
    if not smtp_user:
        return

    msg = MIMEText(
        f"Failed to auto-place Biogents order for Squarespace order {squarespace_order_id}.\n\n"
        f"Error:\n{error}\n\n"
        "Please place this order manually on biogentspro.com."
    )
    msg["Subject"] = f"[GreenGuard] Biogents order failed: {squarespace_order_id}"
    msg["From"]    = smtp_user
    msg["To"]      = NOTIFICATION_EMAIL

    try:
        with smtplib.SMTP(smtp_host, smtp_port) as s:
            s.starttls()
            s.login(smtp_user, smtp_pass)
            s.send_message(msg)
        print(f"  Failure notification sent to {NOTIFICATION_EMAIL}")
    except Exception as e:
        print(f"  Could not send notification email: {e}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def validate_env() -> bool:
    ok = True
    for var in ("SQUARESPACE_API_KEY", "BIOGENTS_USERNAME", "BIOGENTS_PASSWORD"):
        if not os.environ.get(var):
            print(f"ERROR: {var} is not set.")
            ok = False
    return ok


def main() -> None:
    if not validate_env():
        sys.exit(1)

    state = load_state()
    already_done = processed_ids(state)
    since = state.get("last_checked")

    print(f"Fetching Squarespace orders (since {since or 'beginning'})...")
    try:
        orders = fetch_orders(since)
    except Exception as e:
        print(f"ERROR: Could not fetch Squarespace orders: {e}")
        sys.exit(1)

    now_iso = datetime.now(timezone.utc).isoformat()
    state["last_checked"] = now_iso

    orders_with_biogents = [o for o in orders if biogents_items(o)]
    new_orders = [o for o in orders_with_biogents if o["id"] not in already_done]
    print(f"Found {len(orders)} pending orders, {len(orders_with_biogents)} with Biogents items, {len(new_orders)} new.")

    if not new_orders:
        save_state(state)
        print("Nothing to process.")
        return

    if DRY_RUN:
        for order in new_orders:
            items = biogents_items(order)
            print(f"DRY RUN — would process SS order {order['id']}:")
            for li in items:
                print(f"  {li['sku']} x{li['quantity']} → {PRODUCT_MAP.get(li['sku'], 'URL NOT MAPPED')}")
        save_state(state)
        return

    with sync_playwright() as pw:
        buyer = BiogentsBuyer(pw)
        try:
            for order in new_orders:
                ss_id  = order["id"]
                items  = biogents_items(order)
                errors = []

                print(f"Processing SS order {ss_id} ({len(items)} Biogents line items)...")

                placed_items = []
                for li in items:
                    sku = li.get("sku", "")
                    qty = li.get("quantity", 1)
                    for attempt in range(1, MAX_RETRIES + 1):
                        try:
                            conf_id = buyer.place_order(sku, qty, ss_id)
                            placed_items.append({
                                "sku":              sku,
                                "qty":              qty,
                                "biogents_order_id": conf_id,
                            })
                            break
                        except Exception as exc:
                            print(f"  Attempt {attempt}/{MAX_RETRIES} failed for {sku}: {exc}")
                            if attempt == MAX_RETRIES:
                                errors.append(f"{sku}: {exc}")

                record: dict = {
                    "squarespace_order_id": ss_id,
                    "processed_at":         now_iso,
                    "line_items":           placed_items,
                }
                if errors:
                    record["errors"] = errors
                    error_text = "\n".join(errors)
                    print(f"  Errors on order {ss_id}:\n{error_text}")
                    send_failure_notification(ss_id, error_text)

                state["processed_orders"].append(record)
                save_state(state)  # save after each order so partial progress survives
        finally:
            buyer.close()

    print("Done.")


if __name__ == "__main__":
    main()

# {{name}} Add New Product or Service SKU

Add a new service item to the catalog so it appears in Rounds, Quote Builder, and Inventory.

## Step 1: Create Stripe Price
```bash
STRIPE_SECRET_KEY=$(grep STRIPE_SECRET_KEY /path/to/repo/app/.env | cut -d= -f2)
curl -s -X POST "https://api.stripe.com/v1/prices" \
  -H "Authorization: Bearer $STRIPE_SECRET_KEY" \
  -d "unit_amount=CENTS&currency=usd&nickname=SKU_LABEL&product_data[name]=PRODUCT_NAME&billing_scheme=per_unit"
```
Copy the resulting `price_id` (starts with `price_`).

## Step 2: Add env var to Vercel
```bash
cd /path/to/repo/app
vercel env add STRIPE_PRICE_NEWSKU production
# Enter the price_id when prompted
```

## Step 3: Add to lib/businesses/{{id}}/catalog.js
Open `lib/businesses/{{id}}/catalog.js` and add a new entry to the appropriate section:
```js
{ label: 'New Service Name', sku: 'NEW-SKU', price: X.XX, category: 'service' }
```
The `sku` must match the env var suffix (e.g., `NEW-SKU` → `STRIPE_PRICE_NEW_SKU`).

## Step 4: Add to lib/sku-engine.js (if it needs special billing logic)
For inventory-tracked items or items with auto-bundling, update the price resolution logic.

## Step 5: Verify in PRICE_ID_MAP (lib/stripe.js)
Add: `'NEW-SKU': process.env.STRIPE_PRICE_NEW_SKU`

## Step 6: Deploy portal
```bash
./scripts/deploy.sh portal
```

## Where new SKUs appear automatically
- `/admin/rounds` — CatalogSection picks up items from `lib/businesses/{{id}}/catalog.js`
- `/admin/quote` — Quote builder uses the same catalog
- `/admin/invoice` — Invoice add-item uses the same SKU map

<!-- tenant-catalog: edit for your catalog -->
## Current SKU list (quick reference — GreenGuard example, replace with your own)
TANK-REFILL $50, TANK-DELIVERY-FEE $39, TANK-HOOKUP-MAINT $10, BARRIER $49.99, BAIT $10,
BG-SWEETSCENT, CO2-ADDON, ASSESS, TRAP-INSTALL, TRAP-MAINT-*, TIMER-INSTALL, WKD-SURCH,
BG1/BG2/BG3/BG4 (rental), MQ-RENT, MQ-SVC, MQ-INST, OWN-BG, OWN-MQ

## Arguments: SKU name, price, and description
$ARGUMENTS

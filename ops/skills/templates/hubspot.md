# {{name}} HubSpot CRM Operations

Contacts, notes, properties, and bulk operations.

<!-- tenant-catalog: edit for your catalog -->
## Key HubSpot contact properties (GreenGuard example — replace with your own)
| Property | Values | Purpose |
|----------|--------|---------|
| `system_type` | Biogents-CO2, Biogents-NonCO2, Mosqitter-Grand | System installed |
| `plan_type` | rent, own | Ownership model |
| `trap_count` | integer | Number of traps |
| `tank_count` | integer | Number of tanks |
| `recurring_addons` | comma-separated SKUs | Auto-added to every invoice |
| `customer_status` | active, churned | Retention status |
| `payment_status` | ok, failed | Last payment status |
| `service_start_date` | ISO date | First service date |
| `last_visit_date` | ISO date | Most recent service |
| `gate_code` | string | Property access |
| `access_notes` | string | Access instructions |
| `pets_on_property` | string | Pet warning for tech |
| `special_instructions` | string | General notes for tech |
| `billing_contact_name` | string | Split-household billing |

## Common operations
```bash
# These run via Node.js using lib/hubspot.js
cd /path/to/repo/app
node -e "
  require('dotenv').config();
  const { findContactByEmail, updateContact } = require('./lib/hubspot');
  findContactByEmail('EMAIL').then(c => console.log(c.id, c.properties.system_type));
"
```

## Note conventions (used by automation)
See policy `data.noteTags` for the full list. Common ones:
- `[ADMIN-NOTE timestamp] body` — visible in CustomerPanel
- `[QUOTE-SENT/PAID/COLD/LOST/DEAD] jti=X ...` — quote lifecycle
- `[SMS-IN/OUT ...]` — inbound/outbound SMS history
- `[PURCHASE] ...` — payment received
- `[QUOTE-FOLLOWUP-T48] jti=X ...` — 48h nudge sent

## Export all contacts
GET `/api/admin/export` — downloads customers.csv with all contact data

## Import contacts from CSV
POST `/api/admin/import-csv` — bulk import/update contacts

## HubSpot API rate limit
Portal uses batched lookups (`findContactsByEmails`) to avoid rate limits.
Single contact lookups are cached for 60 seconds.

## Arguments: contact email or operation (lookup/update/note)
$ARGUMENTS

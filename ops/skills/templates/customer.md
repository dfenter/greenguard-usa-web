# {{name}} Customer Lookup / Management

Look up, update, or add a customer. Argument: customer name or email.

## Lookup flow
1. Search CRM by name/email: `findContactByEmail` or `findContactsByNames` via `lib/hubspot.js`
2. Search billing platform: `stripe.customers.search({ query: 'email:"X"' })`
3. Check Google Calendar for upcoming appointments

## Portal panel
To view a customer's full profile (the fastest way), open the customer panel:
- Navigate to {{website}}/admin/clients
- Search for the customer name
- Click their row to open the CustomerPanel (Details + History tabs)

## API shortcut (authenticated)
```
GET {{website}}/api/admin/customer-detail?email=EMAIL
```
Returns: name, phone, address, system config, invoices, bookings, notes.

## Add new customer
1. Create CRM contact via `upsertContact` (`lib/hubspot.js`)
2. Billing-platform customer is auto-created on first invoice
3. Set CRM properties for system config and plan
   <!-- tenant-catalog: edit for your catalog -->
4. Book first appointment via `/admin/booking` or the booking platform

## Common updates
- Update address/phone/system config: use `/api/admin/update-customer` endpoint
- Add a note: use NoteComposer in the CustomerPanel or `/api/admin/add-note`
- Tag as churned: set CRM `customer_status: churned`

## Arguments
$ARGUMENTS

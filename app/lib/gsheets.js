// Google Sheets — auto-export rounds, inventory, customers
const { google } = require('googleapis')

function getSheets() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN } = process.env
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN) return null
  const auth = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET)
  auth.setCredentials({ refresh_token: GOOGLE_REFRESH_TOKEN })
  return google.sheets({ version: 'v4', auth })
}

function getDrive() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN } = process.env
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN) return null
  const auth = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET)
  auth.setCredentials({ refresh_token: GOOGLE_REFRESH_TOKEN })
  return google.drive({ version: 'v3', auth })
}

// Get or create a GreenGuard sheet by title
async function getOrCreateSheet(title) {
  const sheetId = process.env[`GSHEET_${title.toUpperCase().replace(/\s+/g, '_')}_ID`]
  if (sheetId) return sheetId

  const drive = getDrive()
  if (!drive) throw new Error('Drive not configured')

  // Search for existing
  const search = await drive.files.list({
    q: `name='${title}' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`,
    fields: 'files(id, name)',
  })
  if (search.data.files?.length) return search.data.files[0].id

  // Create new
  const sheets = getSheets()
  const created = await sheets.spreadsheets.create({
    requestBody: { properties: { title } },
  })
  return created.data.spreadsheetId
}

// Append a row to a sheet
async function appendRow(spreadsheetId, sheetName, values) {
  const sheets = getSheets()
  if (!sheets) throw new Error('Sheets not configured')
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${sheetName}!A1`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [values] },
  })
}

// Ensure header row exists
async function ensureHeaders(spreadsheetId, sheetName, headers) {
  const sheets = getSheets()
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${sheetName}!A1:Z1` })
  if (!res.data.values?.length) {
    await sheets.spreadsheets.values.update({
      spreadsheetId, range: `${sheetName}!A1`, valueInputOption: 'RAW',
      requestBody: { values: [headers] },
    })
  }
}

// Log a completed rounds stop
async function logCompletedStop(stopData) {
  const sheetId = await getOrCreateSheet('GreenGuard Daily Rounds')
  const sheetName = 'Rounds Log'
  await ensureHeaders(sheetId, sheetName, [
    'Date', 'Customer', 'Address', 'Arrival', 'Departure',
    'Services', 'Equipment', 'Add-Ons', 'Products Sold',
    'Service Total', 'Equipment Total', 'Add-Ons Total', 'Products Total', 'Grand Total',
    'Notes', 'Invoice ID', 'Photo Taken',
  ])
  await appendRow(sheetId, sheetName, [
    stopData.date, stopData.customerName, stopData.address,
    stopData.arrivalTime || '', stopData.departureTime || '',
    Object.entries(stopData.serviceQtys || {}).filter(([,q]) => q > 0).map(([l,q]) => `${l}×${q}`).join(', '),
    Object.entries(stopData.equipQtys || {}).filter(([,q]) => q > 0).map(([l,q]) => `${l}×${q}`).join(', '),
    Object.entries(stopData.addonQtys || {}).filter(([,q]) => q > 0).map(([l,q]) => `${l}×${q}`).join(', '),
    Object.entries(stopData.productQtys || {}).filter(([,q]) => q > 0).map(([l,q]) => `${l}×${q}`).join(', '),
    stopData.svcTotal || 0, stopData.eqTotal || 0, stopData.addTotal || 0, stopData.prodTotal || 0, stopData.grandTotal || 0,
    stopData.notes || '', stopData.invoiceId || '', stopData.photoTaken ? 'Yes' : 'No',
  ])
  return sheetId
}

// Log daily tank inventory
async function logTankInventory(entry) {
  const sheetId = await getOrCreateSheet('GreenGuard Tank Inventory')
  const sheetName = 'Daily Log'
  await ensureHeaders(sheetId, sheetName, [
    'Date', 'Full Tanks (EOD)', 'Empty Tanks (EOD)', 'Needed Tomorrow',
    'Empties Picked Up', 'Full Delivered', 'Notes',
  ])
  await appendRow(sheetId, sheetName, [
    entry.date, entry.fullEnd, entry.emptyEnd, entry.neededTomorrow,
    entry.emptiesPickedUp || '', entry.fullDelivered || '', entry.notes || '',
  ])
  return sheetId
}

module.exports = { getOrCreateSheet, appendRow, ensureHeaders, logCompletedStop, logTankInventory }

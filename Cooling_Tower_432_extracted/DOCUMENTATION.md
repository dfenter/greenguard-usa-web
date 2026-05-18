# Cooling Tower Approach Temperature Tool
## Complete Program Documentation

**Platform:** Ignition Perspective 8.1+  
**Database:** Microsoft SQL Server  
**Project Name:** `Cooling_Tower_Approach_Temps`  
**Deployment File:** `Cooling_Tower_432_updated.zip`

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Database Schema](#2-database-schema)
3. [Production Deployment Checklist](#3-production-deployment-checklist)
4. [SQL Script Execution Order](#4-sql-script-execution-order)
5. [Ignition Gateway Configuration](#5-ignition-gateway-configuration)
6. [Application Workflow](#6-application-workflow)
7. [Page Reference](#7-page-reference)
8. [Named Query Reference](#8-named-query-reference)
9. [Known Issues & Fixes Applied](#9-known-issues--fixes-applied)
10. [Data Entry Field Reference](#10-data-entry-field-reference)
11. [Adding a New Site](#11-adding-a-new-site)

---

## 1. System Overview

This Ignition Perspective application tracks **cooling tower approach temperatures** across ~38 Air Separation Unit (ASU) sites organized into 8 US geographic regions. Field operators record three core measurements per equipment circuit each reporting period:

| Measurement | Abbreviation | Definition |
|---|---|---|
| Incoming Water Temperature | IWT | Water temperature entering the cooling tower |
| Process Gas Out Temperature | POGT | Gas temperature leaving the process heat exchanger |
| Design Approach Temperature | DAT | POGT − IWT (computed automatically on save) |

The application compares each DAT against a per-equipment **target** (stored in `coolingTowerStickyValues`). Deviations trigger visual status indicators:

| Status | Condition | Color |
|---|---|---|
| IN SPEC | Worst deviation ≤ 5°F | Green |
| WARNING | Worst deviation 5–10°F | Yellow |
| OUT OF SPEC | Worst deviation > 10°F | Red |
| STALE | No data in last 30 days | Grey |

---

## 2. Database Schema

### Core Tables (must exist before running enhancement scripts)

```
siteListASU                    -- Site master list
  id        INT PK
  site      NVARCHAR(100)
  region    NVARCHAR(100)      -- added by siteListASU_region_DDL.sql

equipmentType                  -- Lookup: equipment categories
  id            INT PK
  equipmentType NVARCHAR(100)
  maxNumber     INT             -- max units of this type per site

parameterTypes                 -- Lookup: measurement parameter IDs
  id            INT PK         -- 1=IWT, 2=POGT, 3=DAT tgt, 4=IWT tgt, 5=POGT tgt, 6=DAT actual
  parameterName NVARCHAR(100)

siteConfig                     -- Per-site equipment counts (set in Config popup)
  id              INT PK
  siteId          INT FK→siteListASU
  MAC, BAC, RNC, FNC, GOX, GAN, CDA,
  chiller, NLUChiller, airExpander, warmExpander,
  coldExpander, argonSkid, auxillaryCooler, DCAC  INT (each 0..maxNumber)

coolingTowerData               -- Equipment catalog (one row = one physical circuit)
  id              INT PK
  siteId          INT FK→siteListASU
  equipmentId     INT FK→equipmentType
  equipmentNumber INT           -- ordinal within type at site (1,2,3…)
  parameter       NVARCHAR(255) -- display name e.g. "MAC 1 Intercooler 1"
  enabled         NVARCHAR(10)  -- 'True' | 'False'

coolingTowerDataHistory        -- Time-series readings
  id                 INT PK
  coolingTowerDataID INT FK→coolingTowerData
  parameterTypesID   INT FK→parameterTypes
  t_stamp            DATETIME
  value              FLOAT
  submittedBy        NVARCHAR(100)
```

### Enhancement Tables (created by DDL scripts)

```
coolingTowerStickyValues       -- Per-equipment target temperatures
  coolingTowerDataID      INT PK FK→coolingTowerData
  approachTempTarget      FLOAT
  incomingWaterTempTarget FLOAT
  processGasOutTempTarget FLOAT
  altEquipmentName        NVARCHAR(255)
  lastModified            DATETIME

coolingTowerTargetHistory      -- Audit trail of target changes
  id                      INT PK IDENTITY
  coolingTowerDataID      INT FK→coolingTowerData
  changedAt               DATETIME
  changedBy               NVARCHAR(100)
  approachTempTarget      FLOAT
  incomingWaterTempTarget FLOAT
  processGasOutTempTarget FLOAT
  altEquipmentName        NVARCHAR(255)

coolingTowerDataNotes          -- Per-save notes
  id          INT PK IDENTITY
  siteId      INT FK→siteListASU
  t_stamp     DATETIME
  note        NVARCHAR(500)
  submittedBy NVARCHAR(100)

coolingTowerSeasonalBaseline   -- Monthly expected DAT per site
  id          INT PK IDENTITY
  siteId      INT FK→siteListASU
  month       INT (1–12)
  baselineDAT FLOAT
  UNIQUE (siteId, month)

userFeedback                   -- In-app user feedback submissions
  id       INT PK IDENTITY
  site     NVARCHAR(100)
  username NVARCHAR(100)
  category NVARCHAR(50)
  feedback NVARCHAR(2000)
  t_stamp  DATETIME
```

### Entity Relationship Summary

```
siteListASU ──┬─── siteConfig              (1:1)
              ├─── coolingTowerData         (1:many)
              ├─── coolingTowerDataNotes    (1:many)
              └─── coolingTowerSeasonalBaseline (1:12)

coolingTowerData ──┬─── coolingTowerDataHistory   (1:many)
                   ├─── coolingTowerStickyValues  (1:1)
                   └─── coolingTowerTargetHistory (1:many)
```

---

## 3. Production Deployment Checklist

### Pre-flight

- [ ] SQL Server instance is accessible from the Ignition Gateway server
- [ ] Two database connection accounts are configured:
  - **Read account** — used by Ignition read queries (SELECT only)
  - **Write account** — used by Ignition write queries (INSERT/UPDATE/MERGE) — referenced as `Plant_Stats_DB_Write_Server` in the project
- [ ] Ignition Gateway 8.1+ is installed and licensed for Perspective
- [ ] A Perspective session with the project name `Cooling_Tower_Approach_Temps` does not conflict with an existing project

### Ignition Session Custom Properties Required

The following session-scoped custom properties **must be created** in the Ignition Gateway Designer before the project will function correctly:

| Property | Type | Default | Purpose |
|---|---|---|---|
| `session.custom.currentSite` | Integer | `0` | Currently selected site ID |
| `session.custom.currentSiteName` | String | `""` | Currently selected site name |
| `session.custom.header` | String | `"Overview"` | Active menu header label |
| `session.custom.site` | String | `""` | Alias for currentSiteName (legacy) |

To create these: In Designer → Project → Session Properties → Custom Properties, add each with the listed type and default.

### Database Connection Names

The project references these named database connections in the Ignition Gateway:

| Connection Name | Purpose |
|---|---|
| *(default)* | Read queries (SELECT) |
| `Plant_Stats_DB_Write_Server` | Write queries (INSERT/UPDATE via transaction) |

Verify these connection names match exactly in Gateway → Config → Databases → Connections.

---

## 4. SQL Script Execution Order

Run these scripts **in order** against the target SQL Server database. Each script is idempotent where possible, but do **not** re-run scripts that create tables if those tables already contain data.

```
Step 1: base_tables_DDL.sql
        Creates: siteListASU, equipmentType, parameterTypes, siteConfig,
                 coolingTowerData, coolingTowerDataHistory
        SKIP if these tables already exist in your database.

Step 2: coolingTowerStickyValues_DDL.sql
        Creates: coolingTowerStickyValues
        Creates index on coolingTowerDataID

Step 3: enhancements_DDL.sql
        ALTER TABLE coolingTowerDataHistory ADD submittedBy
        Creates: coolingTowerDataNotes
        Creates: coolingTowerSeasonalBaseline
        Creates: coolingTowerTargetHistory

Step 4: siteListASU_region_DDL.sql
        ALTER TABLE siteListASU ADD region
        Populates region for all 38 known sites
        VERIFY output: SELECT region, COUNT(*), STRING_AGG(site,', ')
                       FROM siteListASU GROUP BY region

Step 5: userFeedback_DDL.sql
        Creates: userFeedback
```

### Post-DDL Verification Query

```sql
SELECT
    t.name AS TableName,
    p.rows AS RowCount
FROM sys.tables t
JOIN sys.partitions p ON t.object_id = p.object_id AND p.index_id IN (0,1)
WHERE t.name IN (
    'siteListASU','equipmentType','parameterTypes','siteConfig',
    'coolingTowerData','coolingTowerDataHistory',
    'coolingTowerStickyValues','coolingTowerTargetHistory',
    'coolingTowerDataNotes','coolingTowerSeasonalBaseline','userFeedback'
)
ORDER BY t.name;
```

All 11 tables should appear. `equipmentType` should have 15 rows, `parameterTypes` should have 6 rows.

---

## 5. Ignition Gateway Configuration

### Import the Project

1. Gateway Webpage → Config → Projects → Import Project
2. Upload `Cooling_Tower_432_updated.zip`
3. Set project name: `Cooling_Tower_Approach_Temps`
4. Set to **Inherit from Gateway** for database connections

### Page URL Routing

Configure these page routes in Gateway → Perspective → Pages:

| URL Path | View |
|---|---|
| `/` or `/overview` | `Page/Home` |
| `/fleet` | `Page/FleetDashboard` |
| `/central-region` | `Regions/Central Region` |
| `/east-region` | `Regions/East Region` |
| `/midwest-region` | `Regions/Midwest Region` |
| `/north-region` | `Regions/North Region` |
| `/northeast-region` | `Regions/Northeast Region` |
| `/south-region` | `Regions/South Region` |
| `/southeast-region` | `Regions/Southeast Region` |
| `/southwest-region` | `Regions/Southwest Region` |
| `/region-admin` | `Page/RegionAdmin` |

### Dock Configuration

The left-side navigation menu (`Docks/Menu`) must be registered as a **dock** in Perspective Session Properties:
- Dock ID: `left`
- Position: Left
- Size: 185px
- View: `Docks/Menu`

---

## 6. Application Workflow

### Complete User Journey

```
┌─────────────────────────────────────────────────────────┐
│                    HOME PAGE                            │
│  KPI cards (Out of Spec, Warning, Stale counts)         │
│  8 Region navigation buttons                            │
│  → Fleet Dashboard link                                 │
└──────────────┬──────────────────────────────────────────┘
               │  Click region button
               ▼
┌─────────────────────────────────────────────────────────┐
│                  REGION VIEW (e.g. Central)             │
│  Tab per site:  Overview | Irving | Waxahachie | …      │
│  • Clicking a site tab sets session.custom.currentSite  │
└──────┬────────────────────────────┬─────────────────────┘
       │ Click site tab              │ Click "Config" in menu
       ▼                             ▼
┌──────────────────┐   ┌────────────────────────────────┐
│   SITE VIEW      │   │   CONFIGURATION POPUP          │
│  (see below)     │   │   • Select site from dropdown  │
└──────────────────┘   │   • Set equipment counts       │
                        │     (MAC, BAC, RNC, etc.)      │
                        │   • Click SAVE                 │
                        │     → updateSiteConfig         │
                        │     → 15 *DataEnable queries   │
                        │       (enable/disable rows in  │
                        │        coolingTowerData)        │
                        └────────────────────────────────┘
```

### Site View Workflow (detailed)

```
SITE VIEW  (Sites/siteView, loaded for each site tab)
│
├── TOOLBAR (top bar)
│     Date picker ─────────────────────────────────────────────┐
│     IWT Global field + APPLY TO ALL ──────────────────────── │─► fills IWT
│     Notes field                                              │   on all rows
│     Status badge (IN SPEC / WARNING / OUT OF SPEC)          │
│     SAVE DATA button ────────────────────────────────────────┘
│
├── TAB: MAC/BAC
│     FlexRepeater (MAC circuits) ─── InputParameter rows
│     FlexRepeater (BAC circuits) ─── InputParameter rows
│     Each row: Equipment Name | IWT | POGT | DAT (auto) | targets
│
├── TAB: RNC/FNC  (same structure)
├── TAB: GAN/GOX  (same structure)
├── TAB: CDA/MISC (same structure, MISC uses >= equipmentId=8)
│
├── TAB: TRENDS
│     Date range selector (1M / 3M / 6M / 12M buttons + custom)
│     Export CSV button → downloads getHistoryBySite data
│     PowerChart: time-series of DAT actuals + target overlay
│     Data table: raw history values
│
├── TAB: BASELINE  ← New
│     2-column monthly grid (Jan–Jun left, Jul–Dec right)
│     Each month: label | numeric input | current saved value
│     SAVE button → upsertSeasonalBaseline × 12 months
│
└── TAB: HISTORY   ← New
      Target Change History table → getTargetHistory
      Monthly Completeness table → getDataCompletenessHistory
```

### SAVE DATA Button Logic

When SAVE DATA is clicked:

1. Validates a date is selected (shows ErrorPopup if not)
2. Gets the logged-in username (`session.props.auth.user.userName`)
3. Iterates all 4 equipment tabs and both FlexRepeaters in each
4. For each equipment instance with at least one actual value (IWT, POGT, or DAT):
   - Builds a row: `{coolingTowerDataID, parameterTypesID, t_stamp, value, submittedBy}`
5. Calls `insertCoolingTowerData` with all rows as JSON (MERGE — same day = overwrite)
6. If a note was typed, calls `insertNote`
7. Shows SuccessPopup with count of records saved

### Configuration Save Logic

When SAVE is clicked in the Configuration popup:

1. Reads equipment counts from the 15 numeric fields
2. Opens a named query transaction against `Plant_Stats_DB_Write_Server`
3. Calls `updateSiteConfig` — updates the `siteConfig` table
4. Calls each of 15 `*DataEnable` queries within the transaction:
   - First sets `enabled='False'` for ALL rows of that type at the site
   - Then sets `enabled='True'` for rows where `equipmentNumber <= count`
5. Commits the transaction
6. The site view auto-refreshes its FlexRepeater instances (bound to query)

---

## 7. Page Reference

### Home (`Page/Home`)
**Purpose:** Landing page with live fleet health summary.

| Element | Description |
|---|---|
| KPI Cards | 4 cards showing: Total Sites, Out of Spec count (>10°F), Warning count (5–10°F), Stale count (>30 days). All bind to `getFleetSummary`. |
| Region Buttons | 8 buttons navigating directly to each region page. |
| Fleet Dashboard Link | Navigates to `/fleet`. |

---

### Fleet Dashboard (`Page/FleetDashboard`)
**Purpose:** Single-screen view of all sites across all regions.

| Element | Description |
|---|---|
| Summary Badges | ⚠ Out of Spec (red), ⚠ Warning (yellow), 🕐 Stale (grey) — live counts. |
| Region Filter | Dropdown to filter table to a single region. |
| Export CSV | Downloads current filtered view as `fleet_summary.csv`. |
| Fleet Table | One row per site: Site, Region, Last Entry, Days Ago, Spec Status, Completeness %. Clicking a row navigates to that site's region page and sets `session.custom.currentSite`. |

**Data source:** `getFleetSummary` — runs once; both badges and table read from `custom.fleetData`.

---

### Region Views (`Regions/[Name]`)
**Purpose:** Tab container with one tab per site in the region plus an Overview tab.

| Element | Description |
|---|---|
| Overview Tab | Shows the region overview embedded view. |
| Site Tabs | Each tab embeds `Sites/siteView` with the hardcoded `siteId` for that site. |
| Tab onChange | Sets `session.custom.currentSite` and `session.custom.currentSiteName` so Config opens the right site. |

**Regions and their sites:**

| Region | Sites |
|---|---|
| Central | Irving, Waxahachie, Lawton, Mulberry, Odessa, Penwell |
| East | Cayce, Gaston, Spartanburg Brooks, Spartanburg Sha, Wake Forest |
| Midwest | Burlington, Carrollton, Mapleton, Mt Vernon, Pittsboro |
| North | Dickinson, Grimes, Norfolk, Waverly |
| Northeast | Albany, Middletown, St Marys, Toledo, West Point |
| South | San Antonio, Seguin, Stafford, Westlake |
| Southeast | Chattanooga, De Lisle, Lakeland, Orlando, WPB |
| Southwest | Albuquerque, Irwindale, Kapolei, Mesa, Vacaville, Vernon |

---

### Configuration Popup (`Page/Configuration`)
**Purpose:** Set the number of each equipment type active at a site. Opens from the "Config" menu item.

**Flow:** Select site → adjust counts → SAVE → enables/disables `coolingTowerData` rows accordingly.

**Important:** Equipment rows in `coolingTowerData` must be **pre-populated** for each site before the Configuration page can enable them. Rows are not created by this UI — they must be seeded via SQL or a separate setup process. See [Adding a New Site](#11-adding-a-new-site).

---

### Site View (`Sites/siteView`)
**Purpose:** Core data entry and analysis view. Embedded in each region tab.

Parameters: `siteId` (Integer, input), `tabIndex` (Integer, input — sets initial active tab).

**Tabs:**

| Tab | Index | Content |
|---|---|---|
| MAC/BAC | 0 | InputParameter rows for MAC and BAC circuits |
| RNC/FNC | 1 | InputParameter rows for RNC and FNC circuits |
| GAN/GOX | 2 | InputParameter rows for GAN and GOX circuits |
| CDA/MISC | 3 | InputParameter rows for CDA and all expander/skid equipment |
| TRENDS | 4 | Trend chart + CSV export (6-month default window) |
| BASELINE | 5 | Seasonal baseline editor (12-month DAT targets) |
| HISTORY | 6 | Target change history + monthly completeness table |

**On startup, the view:**
1. Sets `trendEndDate = now()`, `trendStartDate = 6 months ago`
2. Resets `selectedEquipment = 'all'`
3. Pre-populates IWT/POGT actuals from `getLastActualsBySite` (saves re-entry)

---

### Region Admin (`Page/RegionAdmin`)
**Purpose:** Reassign sites to different regions without editing code.

**Flow:** Site list loads with current region assignments → select a row → choose new region from dropdown → SAVE (calls `updateSiteRegion`).

---

### User Feedback Popup (`User Feedback/Add Feedback`)
**Purpose:** Allow users to submit bug reports, feature requests, or data issues.

Fields: Site (dropdown), Category (Bug/Data Issue/Feature/UI/Other), Feedback text.  
Saves to: `userFeedback` table via `insertUserFeedback` named query.

---

## 8. Named Query Reference

All queries are under the path `coolingTowerData/` within the Ignition project.

### Read Queries

| Query | Parameters | Returns | Used By |
|---|---|---|---|
| `getFleetSummary` | — | All sites with lastEntry, daysSince, worstDev, completenessPercent | Home, FleetDashboard |
| `getAllRegions` | — | Distinct region names from siteListASU | FleetDashboard filter, RegionAdmin |
| `getAllSitesDropdown` | — | site, id for dropdown options | Configuration, Feedback, RegionAdmin |
| `getAllSitesWithRegion` | — | id, site, region | RegionAdmin |
| `getAllSiteData` | siteId | All enabled coolingTowerData rows | siteView equipment filter |
| `getAllEquipmentTypes` | — | equipmentType list | Configuration |
| `getEquipmentIds` | — | id + equipmentType + maxNumber | Configuration |
| `getSite` | siteId | site name | siteView header |
| `getSiteId` | site | id | Lookups |
| `getSiteConfig` | siteId | Equipment counts row | Configuration |
| `getSitesByRegion` | region | id, site | Region views |
| `getEquipmentData` | siteId, equipmentId | Enabled equipment rows | siteView FlexRepeaters |
| `getEquipmentDataMISC` | siteId, equipmentId | Enabled MISC rows (equipmentId ≥ param) | siteView CDA/MISC tab |
| `getId` | siteId, equipmentId | coolingTowerData ids | siteView |
| `getIdParameters` | siteId, equipmentId | ids for MISC | siteView |
| `getParameters` | siteId, equipmentId | parameter names | siteView |
| `getMiscParameters` | siteId, equipmentId | MISC parameter names | siteView |
| `getHistoryBySite` | siteId, startDate, endDate | Time-series with labels | siteView Trends chart |
| `getLastEntryBySite` | siteId | MAX(t_stamp) | siteView header |
| `getLastEntryBySiteName` | site | MAX(t_stamp) | Overview pages |
| `getLastActualsBySite` | siteId | Latest IWT/POGT/DAT per equipment | siteView pre-population |
| `getLatestOutOfSpec` | siteId | Deviation per equipment+param | siteView status badge |
| `getStickyValues` | coolingTowerDataID | Targets + alt name | InputParameter rows |
| `getSeasonalBaseline` | siteId | month + baselineDAT (12 rows) | siteView Baseline tab |
| `getTargetHistory` | siteId | Target change audit rows | siteView History tab |
| `getNotesBySite` | siteId, startDate, endDate | Notes in date range | siteView |
| `getDataCompletenessHistory` | siteId | yr, mo, equipSubmitted (12 months) | siteView History tab |
| `getMonthlyApproachBySite` | site | Last month's DAT values | Overview pages |

### Write Queries

| Query | Parameters | Action |
|---|---|---|
| `insertCoolingTowerData` | rows (JSON), submittedBy | MERGE into history — same day + equipment = overwrite |
| `insertNote` | siteId, t_stamp, note, submittedBy | INSERT into coolingTowerDataNotes |
| `insertTargetHistory` | coolingTowerDataID, changedBy, targets | INSERT into coolingTowerTargetHistory |
| `insertUserFeedback` | site, username, category, feedback | INSERT into userFeedback |
| `updateSiteConfig` | siteId + 15 equipment counts | UPDATE siteConfig |
| `updateCoolingTowerDataEnable` | siteId, equipmentId, equipmentNumber | Disable all, re-enable up to count |
| `updateSiteRegion` | siteId, region | UPDATE siteListASU.region |
| `upsertStickyValues` | coolingTowerDataID, targets, changedBy | MERGE stickyValues + INSERT history |
| `upsertSeasonalBaseline` | siteId, month, baselineDAT | MERGE coolingTowerSeasonalBaseline |
| `enables/*DataEnable` (×15) | siteId, equipmentNumber | Disable all of type, re-enable up to count |

### Parameter Type IDs

| ID | Name | Description |
|---|---|---|
| 1 | IWT actual | Incoming Water Temp °F (entered by user) |
| 2 | POGT actual | Process Gas Out Temp °F (entered by user) |
| 3 | DAT target | Design Approach Temp target (stored in stickyValues) |
| 4 | IWT target | IWT target (stored in stickyValues) |
| 5 | POGT target | POGT target (stored in stickyValues) |
| 6 | DAT actual | POGT − IWT (computed on save, stored as reading) |

---

## 9. Known Issues & Fixes Applied

The following issues were identified and corrected in version 4.32:

### Fixed in This Release

| Issue | File(s) Changed | Fix |
|---|---|---|
| `userFeedback` table missing — feedback form would throw SQL error on first submit | `userFeedback_DDL.sql` (new), `insertUserFeedback/` (new), `Add Feedback/view.json` | Created DDL, created named query, updated form to use it |
| Feedback used inline `runPrepUpdate` instead of named query | `Add Feedback/view.json` | Replaced with `runNamedQuery('coolingTowerData/insertUserFeedback', …)` |
| FleetDashboard called `getFleetSummary` twice (table + badge bindings) | `FleetDashboard/view.json` | Table now reads from `custom.fleetData` (property binding), eliminating the duplicate query |
| Enable queries only set `enabled='True'` for rows ≤ count — reducing equipment count left old rows still enabled | All 15 `enables/*DataEnable/query.sql` | Each query now disables ALL rows of that type first, then re-enables up to count |
| `updateCoolingTowerDataEnable` had typo `SET "enable"=` (column doesn't exist) | `updateCoolingTowerDataEnable/query.sql` | Fixed to same disable-then-enable pattern |
| Home page was a non-functional placeholder | `Page/Home/view.json` | Replaced with live KPI cards + region navigation buttons |

### Remaining Known Limitation

**Equipment rows are not auto-created.** The Configuration popup sets *counts*, but the underlying `coolingTowerData` rows (one per physical circuit) must be seeded separately. See [Adding a New Site](#11-adding-a-new-site).

---

## 10. Data Entry Field Reference

Each row in the site view data entry tabs (via `Framework/InputParameter` embedded view) presents these fields per equipment circuit:

| Field | Column Name | Param ID | Notes |
|---|---|---|---|
| Equipment Name | `parameter` | — | Read from `coolingTowerData.parameter` |
| Alt Name | `altEquipmentName` | — | Stored in stickyValues; overrides display name |
| IWT Actual (°F) | `designIncomingWaterTempF` | 1 | **Entered by user** |
| IWT Target (°F) | `designIncomingWaterTempFTarget` | 4 | Stored in stickyValues; persists between sessions |
| POGT Actual (°F) | `processGasOutTempF` | 2 | **Entered by user** |
| POGT Target (°F) | `processGasOutTempFTarget` | 5 | Stored in stickyValues |
| DAT Actual (°F) | `designApproachTempF` | 6 | Auto-computed: POGT − IWT |
| DAT Target (°F) | `designApproachTempFTarget` | 3 | Stored in stickyValues |

**IWT Global:** The toolbar "Incoming Water Temp F" field with APPLY TO ALL sets the IWT actual on every equipment row simultaneously (useful when a site has a shared cooling tower water supply).

**Targets are sticky:** When a user sets a target temperature for a piece of equipment, it is saved to `coolingTowerStickyValues` and automatically reloaded the next time that site is opened. Users do not need to re-enter targets each session.

---

## 11. Adding a New Site

To add a site that does not yet exist in the database:

### Step 1: Add site to master list

```sql
INSERT INTO siteListASU (site, region)
VALUES ('New Site Name', 'Central Region');
-- Note the ID assigned
SELECT id FROM siteListASU WHERE site = 'New Site Name';
-- Assume id = 99
```

### Step 2: Create siteConfig row

```sql
INSERT INTO siteConfig (siteId, MAC, BAC, RNC, FNC, GOX, GAN, CDA,
    chiller, NLUChiller, airExpander, warmExpander, coldExpander,
    argonSkid, auxillaryCooler, DCAC)
VALUES (99, 0,0,0,0,0,0,0, 0,0,0,0,0,0,0,0);
```

### Step 3: Seed coolingTowerData rows

Each equipment type needs rows pre-populated up to its `maxNumber` (from `equipmentType`). Example for a site with up to 4 MACs:

```sql
-- MAC (equipmentId=1) — seed all 4 possible rows, initially disabled
INSERT INTO coolingTowerData (siteId, equipmentId, equipmentNumber, parameter, enabled)
VALUES
    (99, 1, 1, 'MAC 1 Intercooler 1', 'False'),
    (99, 1, 2, 'MAC 1 Intercooler 2', 'False'),
    (99, 1, 3, 'MAC 1 Intercooler 3', 'False'),
    (99, 1, 4, 'MAC 1 Aftercooler 1', 'False');
-- Repeat for BAC (equipmentId=2) through NLUChiller (equipmentId=15)
```

**Tip:** Copy the insert pattern from an existing site of similar size:

```sql
-- Duplicate a site's equipment rows for the new site
INSERT INTO coolingTowerData (siteId, equipmentId, equipmentNumber, parameter, enabled)
SELECT 99, equipmentId, equipmentNumber, parameter, 'False'
FROM coolingTowerData
WHERE siteId = 10  -- source site (Irving)
ORDER BY equipmentId, equipmentNumber;
```

### Step 4: Configure via UI

1. Navigate to the site's region in Ignition
2. Click **Config** in the left menu (ensures `session.custom.currentSite = 99`)
3. Set the actual equipment counts for the new site
4. Click **SAVE** — this enables the correct rows in `coolingTowerData`

### Step 5: Add the site tab to the region view

In Ignition Designer, open `Regions/[Region Name]/view.json` and add a new child to the TabContainer:

```json
{
  "meta": { "name": "New Site Name" },
  "position": { "tabIndex": <next_index> },
  "props": {
    "params": { "siteId": 99, "tabIndex": 0 },
    "path": "Sites/siteView"
  },
  "type": "ia.display.view"
}
```

Also add the site name to `tabs` array and update the `onChange` script's `site_ids` dict.

---

*Documentation generated 2026-05-17. Project: Cooling Tower Approach Temps v4.32.*

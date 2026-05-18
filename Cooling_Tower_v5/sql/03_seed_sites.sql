-- =============================================================================
-- 03_SEED_SITES.sql  --  Run after 02_enhancement_tables.sql
-- Seeds all 38 known ASU sites with region assignments and siteConfig rows.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Sites
-- ---------------------------------------------------------------------------
INSERT INTO siteListASU (site, region) VALUES
-- Central
('Irving',              'Central Region'),
('Waxahachie',          'Central Region'),
('Lawton',              'Central Region'),
('Mulberry',            'Central Region'),
('Odessa',              'Central Region'),
('Penwell',             'Central Region'),
-- East
('Cayce',               'East Region'),
('Gaston',              'East Region'),
('Spartanburg Brooks',  'East Region'),
('Spartanburg Sha',     'East Region'),
('Wake Forest',         'East Region'),
-- Midwest
('Burlington',          'Midwest Region'),
('Carrollton',          'Midwest Region'),
('Mapleton',            'Midwest Region'),
('Mt Vernon',           'Midwest Region'),
('Pittsboro',           'Midwest Region'),
-- North
('Dickinson',           'North Region'),
('Grimes',              'North Region'),
('Norfolk',             'North Region'),
('Waverly',             'North Region'),
-- Northeast
('Albany',              'Northeast Region'),
('Middletown',          'Northeast Region'),
('St Marys',            'Northeast Region'),
('Toledo',              'Northeast Region'),
('West Point',          'Northeast Region'),
-- South
('San Antonio',         'South Region'),
('Seguin',              'South Region'),
('Stafford',            'South Region'),
('Westlake',            'South Region'),
-- Southeast
('Chattanooga',         'Southeast Region'),
('De Lisle',            'Southeast Region'),
('Lakeland',            'Southeast Region'),
('Orlando',             'Southeast Region'),
('WPB',                 'Southeast Region'),
-- Southwest
('Albuquerque',         'Southwest Region'),
('Irwindale',           'Southwest Region'),
('Kapolei',             'Southwest Region'),
('Mesa',                'Southwest Region'),
('Vacaville',           'Southwest Region'),
('Vernon',              'Southwest Region');

-- ---------------------------------------------------------------------------
-- siteConfig — one row per site, all counts default 0.
-- Use the Configuration popup in the application to set actual counts.
-- ---------------------------------------------------------------------------
INSERT INTO siteConfig (siteId)
SELECT id FROM siteListASU ORDER BY id;

-- ---------------------------------------------------------------------------
-- coolingTowerData — seed all possible equipment rows per site (all disabled).
-- The Configuration popup enables the correct rows per site.
-- Each site gets maxNumber rows per equipment type.
-- ---------------------------------------------------------------------------
INSERT INTO coolingTowerData (siteId, equipmentId, equipmentNumber, parameter, enabled)
SELECT
    s.id,
    e.id          AS equipmentId,
    n.num         AS equipmentNumber,
    e.equipmentType + ' ' + CAST(n.num AS NVARCHAR(5)) AS parameter,
    'False'
FROM siteListASU s
CROSS JOIN equipmentType e
CROSS JOIN (
    SELECT 1 AS num UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL
    SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6
) n
WHERE n.num <= e.maxNumber
ORDER BY s.id, e.id, n.num;

-- Verify
SELECT
    s.site,
    s.region,
    COUNT(c.id) AS totalEquipmentRows
FROM siteListASU s
JOIN coolingTowerData c ON c.siteId = s.id
GROUP BY s.id, s.site, s.region
ORDER BY s.region, s.site;

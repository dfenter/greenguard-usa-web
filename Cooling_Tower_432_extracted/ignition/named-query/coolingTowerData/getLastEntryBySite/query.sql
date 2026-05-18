-- Returns the most recent t_stamp recorded for a site across all equipment.
-- Used to display "Last Updated" on the siteView header and overview pages.
SELECT MAX(h.t_stamp) AS lastEntry
FROM coolingTowerDataHistory h
INNER JOIN coolingTowerData c ON h.coolingTowerDataID = c.id
WHERE c.siteId = :siteId
  AND c.enabled = 'True'

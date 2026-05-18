SELECT MAX(h.t_stamp) AS lastEntry
FROM coolingTowerDataHistory h
INNER JOIN coolingTowerData c  ON h.coolingTowerDataID = c.id
INNER JOIN siteListASU    s  ON c.siteId = s.id
WHERE s.site = :site
  AND c.enabled = 'True'

SELECT MAX(h.t_stamp) AS lastEntry
FROM coolingTowerDataHistory h
INNER JOIN coolingTowerData c ON h.coolingTowerDataID = c.id
WHERE c.siteId = :siteId
  AND c.enabled = 'True'

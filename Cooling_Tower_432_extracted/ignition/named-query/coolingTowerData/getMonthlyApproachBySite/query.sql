SELECT h.value
FROM coolingTowerDataHistory h
INNER JOIN coolingTowerData c ON h.coolingTowerDataID = c.id
INNER JOIN siteListASU s ON c.siteId = s.id
WHERE s.site = :site
  AND h.parameterTypesID = 6
  AND h.t_stamp >= DATEADD(month, -1, GETDATE())
ORDER BY h.t_stamp ASC

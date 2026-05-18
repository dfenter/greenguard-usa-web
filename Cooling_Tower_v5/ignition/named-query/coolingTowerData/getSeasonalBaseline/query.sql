SELECT month, baselineDAT
FROM coolingTowerSeasonalBaseline
WHERE siteId = :siteId
ORDER BY month ASC

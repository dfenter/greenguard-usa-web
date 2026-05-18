SELECT parameter
FROM coolingTowerData
WHERE siteId = :siteId
  AND equipmentId = :equipmentId
  AND enabled = 'True'
ORDER BY equipmentNumber ASC

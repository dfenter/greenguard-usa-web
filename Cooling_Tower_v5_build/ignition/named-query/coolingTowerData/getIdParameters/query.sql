SELECT id, parameter
FROM coolingTowerData
WHERE siteId = :siteId
  AND equipmentId >= :equipmentId
  AND enabled = 'True'
ORDER BY equipmentId ASC, equipmentNumber ASC

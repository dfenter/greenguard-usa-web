SELECT id, siteId, equipmentId, equipmentNumber, parameter, enabled
FROM coolingTowerData
WHERE siteId = :siteId
  AND equipmentId >= :equipmentId
  AND enabled = 'True'
ORDER BY equipmentId ASC, equipmentNumber ASC

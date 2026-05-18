UPDATE coolingTowerData SET enabled = 'False'
WHERE siteId = :siteId AND equipmentId = 12;

UPDATE coolingTowerData SET enabled = 'True'
WHERE siteId = :siteId AND equipmentId = 12 AND equipmentNumber <= :equipmentNumber;

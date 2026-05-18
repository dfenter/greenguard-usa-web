UPDATE coolingTowerData SET enabled = 'False'
WHERE siteId = :siteId AND equipmentId = 2;

UPDATE coolingTowerData SET enabled = 'True'
WHERE siteId = :siteId AND equipmentId = 2 AND equipmentNumber <= :equipmentNumber;

UPDATE coolingTowerData SET enabled = 'False'
WHERE siteId = :siteId AND equipmentId = 3;

UPDATE coolingTowerData SET enabled = 'True'
WHERE siteId = :siteId AND equipmentId = 3 AND equipmentNumber <= :equipmentNumber;

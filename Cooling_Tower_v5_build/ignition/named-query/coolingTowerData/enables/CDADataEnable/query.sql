UPDATE coolingTowerData SET enabled = 'False'
WHERE siteId = :siteId AND equipmentId = 7;

UPDATE coolingTowerData SET enabled = 'True'
WHERE siteId = :siteId AND equipmentId = 7 AND equipmentNumber <= :equipmentNumber;

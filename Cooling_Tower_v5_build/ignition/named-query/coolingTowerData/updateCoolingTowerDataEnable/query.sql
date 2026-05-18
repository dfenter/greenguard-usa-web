UPDATE coolingTowerData SET enabled = 'False'
WHERE siteId = :siteId AND equipmentId = :equipmentId;

UPDATE coolingTowerData SET enabled = 'True'
WHERE siteId = :siteId AND equipmentId = :equipmentId AND equipmentNumber <= :equipmentNumber;

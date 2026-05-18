-- Disable all rows for the given equipmentId at the site, then re-enable up to the count.
UPDATE coolingTowerData SET enabled = 'False'
WHERE siteId = :siteId AND equipmentId = :equipmentId;

UPDATE coolingTowerData SET enabled = 'True'
WHERE siteId = :siteId AND equipmentId = :equipmentId AND equipmentNumber <= :equipmentNumber;

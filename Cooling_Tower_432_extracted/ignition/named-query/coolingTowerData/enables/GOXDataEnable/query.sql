-- Disable all rows of this equipment type at the site, then re-enable up to the configured count.
UPDATE coolingTowerData SET enabled = 'False'
WHERE siteId = :siteId AND equipmentId = 5;

UPDATE coolingTowerData SET enabled = 'True'
WHERE siteId = :siteId AND equipmentId = 5 AND equipmentNumber <= :equipmentNumber;

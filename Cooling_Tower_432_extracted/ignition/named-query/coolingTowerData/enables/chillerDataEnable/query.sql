UPDATE coolingTowerData
SET "enabled"= 'TRUE'
WHERE "siteId" = :siteId
AND "equipmentId" = 14
AND "equipmentNumber" <= :equipmentNumber

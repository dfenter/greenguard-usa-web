UPDATE coolingTowerData
SET "enabled"= 'TRUE'
WHERE "siteId" = :siteId
AND "equipmentId" = 3
AND "equipmentNumber" <= :equipmentNumber

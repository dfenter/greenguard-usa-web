UPDATE coolingTowerData
SET "enabled"= 'TRUE'
WHERE "siteId" = :siteId
AND "equipmentId" = 13
AND "equipmentNumber" <= :equipmentNumber

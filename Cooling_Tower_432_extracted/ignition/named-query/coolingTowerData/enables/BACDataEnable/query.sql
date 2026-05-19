UPDATE coolingTowerData
SET "enabled"= 'TRUE'
WHERE "siteId" = :siteId
AND "equipmentId" = 2
AND "equipmentNumber" <= :equipmentNumber

UPDATE coolingTowerData
SET "enabled"= 'TRUE'
WHERE "siteId" = :siteId
AND "equipmentId" = 10
AND "equipmentNumber" <= :equipmentNumber

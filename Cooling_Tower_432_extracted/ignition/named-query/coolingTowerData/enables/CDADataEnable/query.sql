UPDATE coolingTowerData
SET "enabled"= 'TRUE'
WHERE "siteId" = :siteId
AND "equipmentId" = 7
AND "equipmentNumber" <= :equipmentNumber

UPDATE coolingTowerData
SET "enabled"= 'TRUE'
WHERE "siteId" = :siteId
AND "equipmentId" = 1
AND "equipmentNumber" <= :equipmentNumber

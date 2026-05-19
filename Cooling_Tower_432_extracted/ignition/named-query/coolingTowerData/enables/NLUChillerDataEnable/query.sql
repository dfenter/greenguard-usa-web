UPDATE coolingTowerData
SET "enabled"= 'TRUE'
WHERE "siteId" = :siteId
AND "equipmentId" = 15
AND "equipmentNumber" <= :equipmentNumber

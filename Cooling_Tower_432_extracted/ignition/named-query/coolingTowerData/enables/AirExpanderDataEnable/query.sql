UPDATE coolingTowerData
SET "enabled"= 'TRUE'
WHERE "siteId" = :siteId
AND "equipmentId" = 8
AND "equipmentNumber" <= :equipmentNumber

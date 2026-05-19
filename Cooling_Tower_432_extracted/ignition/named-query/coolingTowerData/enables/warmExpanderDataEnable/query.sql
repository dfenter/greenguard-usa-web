UPDATE coolingTowerData
SET "enabled"= 'TRUE'
WHERE "siteId" = :siteId
AND "equipmentId" = 9
AND "equipmentNumber" <= :equipmentNumber

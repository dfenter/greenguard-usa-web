UPDATE coolingTowerData
SET "enabled"= 'TRUE'
WHERE "siteId" = :siteId
AND "equipmentId" = 4
AND "equipmentNumber" <= :equipmentNumber

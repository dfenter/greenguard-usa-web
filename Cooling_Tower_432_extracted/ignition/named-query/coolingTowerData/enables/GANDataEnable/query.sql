UPDATE coolingTowerData
SET "enabled"= 'TRUE'
WHERE "siteId" = :siteId
AND "equipmentId" = 6
AND "equipmentNumber" <= :equipmentNumber

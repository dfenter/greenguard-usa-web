UPDATE coolingTowerData
SET "enabled"= 'TRUE'
WHERE "siteId" = :siteId
AND "equipmentId" = 11
AND "equipmentNumber" <= :equipmentNumber

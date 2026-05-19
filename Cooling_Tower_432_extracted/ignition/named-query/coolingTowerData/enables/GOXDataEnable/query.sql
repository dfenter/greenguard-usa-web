UPDATE coolingTowerData
SET "enabled"= 'TRUE'
WHERE "siteId" = :siteId
AND "equipmentId" = 5
AND "equipmentNumber" <= :equipmentNumber

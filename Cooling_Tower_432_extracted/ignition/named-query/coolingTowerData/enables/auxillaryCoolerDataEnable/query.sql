UPDATE coolingTowerData
SET "enabled"= 'TRUE'
WHERE "siteId" = :siteId
AND "equipmentId" = 12
AND "equipmentNumber" <= :equipmentNumber

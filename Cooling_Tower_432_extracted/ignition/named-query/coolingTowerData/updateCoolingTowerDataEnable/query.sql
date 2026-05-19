UPDATE coolingTowerData
SET "enable"= 'TRUE'
WHERE "siteId" = :siteId
AND "equipmentId" = :equipmentId
AND "equipmentNumber" <= :equipmentNumber

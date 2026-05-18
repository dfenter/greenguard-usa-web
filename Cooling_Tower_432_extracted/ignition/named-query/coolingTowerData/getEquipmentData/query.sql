SELECT * 
FROM coolingTowerData
WHERE "siteId"= :siteId
AND "enabled"= 'True'
AND "equipmentId"= :equipmentId
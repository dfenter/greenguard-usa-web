SELECT th.changedAt, th.changedBy,
       th.approachTempTarget, th.incomingWaterTempTarget,
       th.processGasOutTempTarget, th.altEquipmentName,
       c.parameter AS equipmentName
FROM coolingTowerTargetHistory th
INNER JOIN coolingTowerData c ON th.coolingTowerDataID = c.id
WHERE c.siteId = :siteId
ORDER BY th.changedAt DESC

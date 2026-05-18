SELECT
    th.changedAt, th.changedBy,
    th.approachTempTarget, th.incomingWaterTempTarget,
    th.processGasOutTempTarget, th.altEquipmentName,
    COALESCE(sv.altEquipmentName, c.parameter) AS equipmentName
FROM coolingTowerTargetHistory th
INNER JOIN coolingTowerData c ON th.coolingTowerDataID = c.id
LEFT  JOIN coolingTowerStickyValues sv ON th.coolingTowerDataID = sv.coolingTowerDataID
WHERE c.siteId = :siteId
ORDER BY th.changedAt DESC

SELECT coolingTowerDataID, approachTempTarget, incomingWaterTempTarget,
       processGasOutTempTarget, altEquipmentName, lastModified
FROM coolingTowerStickyValues
WHERE coolingTowerDataID = :coolingTowerDataID

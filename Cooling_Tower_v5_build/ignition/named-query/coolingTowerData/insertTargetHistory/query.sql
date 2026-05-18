INSERT INTO coolingTowerTargetHistory
    (coolingTowerDataID, changedAt, changedBy, approachTempTarget,
     incomingWaterTempTarget, processGasOutTempTarget, altEquipmentName)
VALUES
    (:coolingTowerDataID, GETDATE(), :changedBy,
     :approachTempTarget, :incomingWaterTempTarget, :processGasOutTempTarget, :altEquipmentName)

-- Upsert current target values, then log the change to history.
MERGE INTO coolingTowerStickyValues AS target
USING (SELECT :coolingTowerDataID AS coolingTowerDataID) AS src
ON target.coolingTowerDataID = src.coolingTowerDataID
WHEN MATCHED THEN
    UPDATE SET
        approachTempTarget      = :approachTempTarget,
        incomingWaterTempTarget = :incomingWaterTempTarget,
        processGasOutTempTarget = :processGasOutTempTarget,
        altEquipmentName        = :altEquipmentName,
        lastModified            = GETDATE()
WHEN NOT MATCHED THEN
    INSERT (coolingTowerDataID, approachTempTarget, incomingWaterTempTarget,
            processGasOutTempTarget, altEquipmentName)
    VALUES (:coolingTowerDataID, :approachTempTarget, :incomingWaterTempTarget,
            :processGasOutTempTarget, :altEquipmentName);

-- Log the change
INSERT INTO coolingTowerTargetHistory
    (coolingTowerDataID, changedBy, approachTempTarget,
     incomingWaterTempTarget, processGasOutTempTarget, altEquipmentName)
VALUES
    (:coolingTowerDataID, :changedBy, :approachTempTarget,
     :incomingWaterTempTarget, :processGasOutTempTarget, :altEquipmentName);

-- Run this script once against your database to create the sticky values table.
-- This stores per-equipment target values and alternate names so users don't
-- have to re-enter them each session.

CREATE TABLE coolingTowerStickyValues (
    coolingTowerDataID    INT           NOT NULL PRIMARY KEY,
    approachTempTarget    FLOAT         NULL,
    incomingWaterTempTarget FLOAT       NULL,
    processGasOutTempTarget FLOAT       NULL,
    altEquipmentName      NVARCHAR(255) NULL,
    lastModified          DATETIME      NOT NULL DEFAULT GETDATE(),
    CONSTRAINT FK_stickyValues_coolingTowerData
        FOREIGN KEY (coolingTowerDataID)
        REFERENCES coolingTowerData(id)
        ON DELETE CASCADE
);

CREATE INDEX IX_stickyValues_coolingTowerDataID
    ON coolingTowerStickyValues (coolingTowerDataID);

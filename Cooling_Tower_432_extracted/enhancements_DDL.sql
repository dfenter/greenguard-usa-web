-- ============================================================
-- ENHANCEMENTS DDL  –  run once in order
-- ============================================================

-- 1. Audit trail: who saved what and when
ALTER TABLE coolingTowerDataHistory
    ADD submittedBy NVARCHAR(100) NULL;

-- 2. Notes per save batch
CREATE TABLE coolingTowerDataNotes (
    id          INT           NOT NULL IDENTITY(1,1) PRIMARY KEY,
    siteId      INT           NOT NULL,
    t_stamp     DATETIME      NOT NULL,
    note        NVARCHAR(500) NOT NULL,
    submittedBy NVARCHAR(100) NULL,
    CONSTRAINT FK_notes_site FOREIGN KEY (siteId)
        REFERENCES siteListASU(id) ON DELETE CASCADE
);
CREATE INDEX IX_notes_site_stamp ON coolingTowerDataNotes (siteId, t_stamp DESC);

-- 3. Seasonal baseline table
CREATE TABLE coolingTowerSeasonalBaseline (
    id          INT   NOT NULL IDENTITY(1,1) PRIMARY KEY,
    siteId      INT   NOT NULL,
    month       INT   NOT NULL CHECK (month BETWEEN 1 AND 12),
    baselineDAT FLOAT NOT NULL,
    CONSTRAINT UQ_baseline_site_month UNIQUE (siteId, month),
    CONSTRAINT FK_baseline_site FOREIGN KEY (siteId)
        REFERENCES siteListASU(id) ON DELETE CASCADE
);

-- 4. Target change history
CREATE TABLE coolingTowerTargetHistory (
    id                      INT           NOT NULL IDENTITY(1,1) PRIMARY KEY,
    coolingTowerDataID      INT           NOT NULL,
    changedAt               DATETIME      NOT NULL DEFAULT GETDATE(),
    changedBy               NVARCHAR(100) NULL,
    approachTempTarget      FLOAT         NULL,
    incomingWaterTempTarget FLOAT         NULL,
    processGasOutTempTarget FLOAT         NULL,
    altEquipmentName        NVARCHAR(255) NULL,
    CONSTRAINT FK_targetHistory_ctd FOREIGN KEY (coolingTowerDataID)
        REFERENCES coolingTowerData(id) ON DELETE CASCADE
);
CREATE INDEX IX_targetHistory_id_date
    ON coolingTowerTargetHistory (coolingTowerDataID, changedAt DESC);

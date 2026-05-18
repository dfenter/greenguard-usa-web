-- =============================================================================
-- 02_ENHANCEMENT_TABLES.sql  --  Run after 01_base_tables.sql
-- =============================================================================

-- Per-equipment target temperatures (survive between sessions)
CREATE TABLE coolingTowerStickyValues (
    coolingTowerDataID      INT           NOT NULL PRIMARY KEY,
    approachTempTarget      FLOAT         NULL,
    incomingWaterTempTarget FLOAT         NULL,
    processGasOutTempTarget FLOAT         NULL,
    altEquipmentName        NVARCHAR(255) NULL,
    lastModified            DATETIME      NOT NULL DEFAULT GETDATE(),
    CONSTRAINT FK_sticky_ctd FOREIGN KEY (coolingTowerDataID)
        REFERENCES coolingTowerData(id) ON DELETE CASCADE
);

-- Audit trail of target changes
CREATE TABLE coolingTowerTargetHistory (
    id                      INT           NOT NULL IDENTITY(1,1) PRIMARY KEY,
    coolingTowerDataID      INT           NOT NULL,
    changedAt               DATETIME      NOT NULL DEFAULT GETDATE(),
    changedBy               NVARCHAR(100) NULL,
    approachTempTarget      FLOAT         NULL,
    incomingWaterTempTarget FLOAT         NULL,
    processGasOutTempTarget FLOAT         NULL,
    altEquipmentName        NVARCHAR(255) NULL,
    CONSTRAINT FK_tgtHist_ctd FOREIGN KEY (coolingTowerDataID)
        REFERENCES coolingTowerData(id) ON DELETE CASCADE
);
CREATE INDEX IX_tgtHist_id_date ON coolingTowerTargetHistory (coolingTowerDataID, changedAt DESC);

-- Per-save operator notes
CREATE TABLE coolingTowerDataNotes (
    id          INT           NOT NULL IDENTITY(1,1) PRIMARY KEY,
    siteId      INT           NOT NULL,
    t_stamp     DATETIME      NOT NULL,
    note        NVARCHAR(500) NOT NULL,
    submittedBy NVARCHAR(100) NULL,
    CONSTRAINT FK_notes_site FOREIGN KEY (siteId) REFERENCES siteListASU(id) ON DELETE CASCADE
);
CREATE INDEX IX_notes_site_stamp ON coolingTowerDataNotes (siteId, t_stamp DESC);

-- Monthly seasonal baseline DAT per site
CREATE TABLE coolingTowerSeasonalBaseline (
    id          INT   NOT NULL IDENTITY(1,1) PRIMARY KEY,
    siteId      INT   NOT NULL,
    month       INT   NOT NULL CHECK (month BETWEEN 1 AND 12),
    baselineDAT FLOAT NOT NULL,
    CONSTRAINT UQ_baseline_site_month UNIQUE (siteId, month),
    CONSTRAINT FK_baseline_site FOREIGN KEY (siteId) REFERENCES siteListASU(id) ON DELETE CASCADE
);

-- User feedback submissions
CREATE TABLE userFeedback (
    id       INT            NOT NULL IDENTITY(1,1) PRIMARY KEY,
    site     NVARCHAR(100)  NOT NULL,
    username NVARCHAR(100)  NULL,
    category NVARCHAR(50)   NOT NULL,
    feedback NVARCHAR(2000) NOT NULL,
    t_stamp  DATETIME       NOT NULL DEFAULT GETDATE()
);
CREATE INDEX IX_feedback_stamp ON userFeedback (t_stamp DESC);

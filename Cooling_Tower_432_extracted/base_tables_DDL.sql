-- =============================================================================
-- BASE TABLES DDL  --  Cooling Tower Approach Temps (Ignition Project)
-- =============================================================================
-- These tables are the foundational schema that must exist BEFORE running any
-- of the enhancement scripts.  If your database already has these tables from a
-- prior version, skip to the section labelled "OPTIONAL: verify structure".
--
-- Run order:
--   1. base_tables_DDL.sql            (this file)
--   2. coolingTowerStickyValues_DDL.sql
--   3. enhancements_DDL.sql
--   4. siteListASU_region_DDL.sql
--   5. userFeedback_DDL.sql
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 1. Site master list
-- ---------------------------------------------------------------------------
CREATE TABLE siteListASU (
    id      INT           NOT NULL IDENTITY(1,1) PRIMARY KEY,
    site    NVARCHAR(100) NOT NULL UNIQUE
    -- NOTE: the 'region' column is added by siteListASU_region_DDL.sql
);


-- ---------------------------------------------------------------------------
-- 2. Equipment type lookup
--    equipmentId values must match the hard-coded IDs used in the Ignition
--    named queries (1=MAC, 2=BAC, 3=RNC, 4=FNC, 5=GOX, 6=GAN, 7=CDA,
--    8=AirExpander, 9=WarmExpander, 10=ColdExpander, 11=ArgonSkid,
--    12=AuxillaryCooler, 13=DCAC, 14=Chiller, 15=NLUChiller).
-- ---------------------------------------------------------------------------
CREATE TABLE equipmentType (
    id            INT           NOT NULL IDENTITY(1,1) PRIMARY KEY,
    equipmentType NVARCHAR(100) NOT NULL UNIQUE,
    maxNumber     INT           NOT NULL DEFAULT 4
);

INSERT INTO equipmentType (equipmentType, maxNumber) VALUES
    ('MAC',             4),
    ('BAC',             4),
    ('RNC',             4),
    ('FNC',             4),
    ('GOX',             4),
    ('GAN',             4),
    ('CDA',             6),
    ('AirExpander',     2),
    ('WarmExpander',    2),
    ('ColdExpander',    2),
    ('ArgonSkid',       2),
    ('AuxillaryCooler', 6),
    ('DCAC',            2),
    ('Chiller',         2),
    ('NLUChiller',      2);


-- ---------------------------------------------------------------------------
-- 3. Measurement parameter types
--    parameterTypesID values are referenced by name throughout the codebase:
--      1 = IWT actual  (Incoming Water Temp °F)
--      2 = POGT actual (Process Gas Out Temp °F)
--      3 = DAT target  (Design Approach Temp target – stored as sticky value)
--      4 = IWT target  (stored as sticky value)
--      5 = POGT target (stored as sticky value)
--      6 = DAT actual  (= POGT - IWT, computed on save)
-- ---------------------------------------------------------------------------
CREATE TABLE parameterTypes (
    id            INT           NOT NULL PRIMARY KEY,
    parameterName NVARCHAR(100) NOT NULL
);

INSERT INTO parameterTypes (id, parameterName) VALUES
    (1, 'designIncomingWaterTempF'),
    (2, 'processGasOutTempF'),
    (3, 'designApproachTempFTarget'),
    (4, 'designIncomingWaterTempFTarget'),
    (5, 'processGasOutTempFTarget'),
    (6, 'designApproachTempF');


-- ---------------------------------------------------------------------------
-- 4. Per-site equipment configuration  (counts per equipment type)
-- ---------------------------------------------------------------------------
CREATE TABLE siteConfig (
    id              INT NOT NULL IDENTITY(1,1) PRIMARY KEY,
    siteId          INT NOT NULL,
    MAC             INT NOT NULL DEFAULT 0,
    BAC             INT NOT NULL DEFAULT 0,
    RNC             INT NOT NULL DEFAULT 0,
    FNC             INT NOT NULL DEFAULT 0,
    GOX             INT NOT NULL DEFAULT 0,
    GAN             INT NOT NULL DEFAULT 0,
    CDA             INT NOT NULL DEFAULT 0,
    chiller         INT NOT NULL DEFAULT 0,
    NLUChiller      INT NOT NULL DEFAULT 0,
    airExpander     INT NOT NULL DEFAULT 0,
    warmExpander    INT NOT NULL DEFAULT 0,
    coldExpander    INT NOT NULL DEFAULT 0,
    argonSkid       INT NOT NULL DEFAULT 0,
    auxillaryCooler INT NOT NULL DEFAULT 0,
    DCAC            INT NOT NULL DEFAULT 0,
    intercoolers    INT NOT NULL DEFAULT 0,
    aftercoolers    INT NOT NULL DEFAULT 0,
    oilcoolers      INT NOT NULL DEFAULT 0,
    auxEquipment    INT NOT NULL DEFAULT 0,
    CONSTRAINT FK_siteConfig_site FOREIGN KEY (siteId)
        REFERENCES siteListASU(id) ON DELETE CASCADE,
    CONSTRAINT UQ_siteConfig_site UNIQUE (siteId)
);


-- ---------------------------------------------------------------------------
-- 5. Equipment catalog  (one row per physical cooling circuit at each site)
--    equipmentNumber is the ordinal within its type at the site (1, 2, 3…).
--    parameter is the display name (e.g. "MAC 1 Intercooler 1").
--    enabled is toggled by the Configuration page via the *DataEnable queries.
-- ---------------------------------------------------------------------------
CREATE TABLE coolingTowerData (
    id              INT           NOT NULL IDENTITY(1,1) PRIMARY KEY,
    siteId          INT           NOT NULL,
    equipmentId     INT           NOT NULL,
    equipmentNumber INT           NOT NULL,
    parameter       NVARCHAR(255) NOT NULL,
    enabled         NVARCHAR(10)  NOT NULL DEFAULT 'False',
    CONSTRAINT FK_ctd_site  FOREIGN KEY (siteId)      REFERENCES siteListASU(id),
    CONSTRAINT FK_ctd_eqType FOREIGN KEY (equipmentId) REFERENCES equipmentType(id)
);

CREATE INDEX IX_ctd_site_eq ON coolingTowerData (siteId, equipmentId, equipmentNumber);


-- ---------------------------------------------------------------------------
-- 6. Time-series readings
--    submittedBy is added by enhancements_DDL.sql if it does not exist yet.
-- ---------------------------------------------------------------------------
CREATE TABLE coolingTowerDataHistory (
    id                  INT      NOT NULL IDENTITY(1,1) PRIMARY KEY,
    coolingTowerDataID  INT      NOT NULL,
    parameterTypesID    INT      NOT NULL,
    t_stamp             DATETIME NOT NULL,
    value               FLOAT    NULL,
    submittedBy         NVARCHAR(100) NULL,
    CONSTRAINT FK_ctdh_ctd  FOREIGN KEY (coolingTowerDataID)
        REFERENCES coolingTowerData(id) ON DELETE CASCADE,
    CONSTRAINT FK_ctdh_param FOREIGN KEY (parameterTypesID)
        REFERENCES parameterTypes(id)
);

CREATE INDEX IX_ctdh_id_stamp    ON coolingTowerDataHistory (coolingTowerDataID, t_stamp DESC);
CREATE INDEX IX_ctdh_param_stamp ON coolingTowerDataHistory (parameterTypesID, t_stamp DESC);


-- =============================================================================
-- OPTIONAL: verify structure after running
-- =============================================================================
SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME IN (
    'siteListASU','equipmentType','parameterTypes',
    'siteConfig','coolingTowerData','coolingTowerDataHistory'
)
ORDER BY TABLE_NAME, ORDINAL_POSITION;

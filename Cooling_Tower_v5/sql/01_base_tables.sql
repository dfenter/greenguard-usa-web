-- =============================================================================
-- 01_BASE_TABLES.sql  --  Cooling Tower Approach Temps v5
-- Run this first on a blank database.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Site master list
-- ---------------------------------------------------------------------------
CREATE TABLE siteListASU (
    id     INT           NOT NULL IDENTITY(1,1) PRIMARY KEY,
    site   NVARCHAR(100) NOT NULL UNIQUE,
    region NVARCHAR(100) NULL
);

-- ---------------------------------------------------------------------------
-- Equipment type lookup  (15 types; IDs must match named query hard-codes)
-- ---------------------------------------------------------------------------
CREATE TABLE equipmentType (
    id            INT           NOT NULL PRIMARY KEY,
    equipmentType NVARCHAR(100) NOT NULL UNIQUE,
    maxNumber     INT           NOT NULL DEFAULT 4
);

INSERT INTO equipmentType (id, equipmentType, maxNumber) VALUES
(1,  'MAC',             4),
(2,  'BAC',             4),
(3,  'RNC',             4),
(4,  'FNC',             4),
(5,  'GOX',             4),
(6,  'GAN',             4),
(7,  'CDA',             6),
(8,  'AirExpander',     2),
(9,  'WarmExpander',    2),
(10, 'ColdExpander',    2),
(11, 'ArgonSkid',       2),
(12, 'AuxillaryCooler', 6),
(13, 'DCAC',            2),
(14, 'Chiller',         2),
(15, 'NLUChiller',      2);

-- ---------------------------------------------------------------------------
-- Measurement parameter types
-- IDs are hard-coded throughout named queries — do NOT change them.
-- ---------------------------------------------------------------------------
CREATE TABLE parameterTypes (
    id            INT           NOT NULL PRIMARY KEY,
    parameterName NVARCHAR(100) NOT NULL,
    description   NVARCHAR(255) NULL
);

INSERT INTO parameterTypes (id, parameterName, description) VALUES
(1, 'IWT_actual',      'Incoming Water Temp °F — entered by operator'),
(2, 'POGT_actual',     'Process Gas Out Temp °F — entered by operator'),
(3, 'DAT_target',      'Design Approach Temp target — stored in stickyValues'),
(4, 'IWT_target',      'IWT target — stored in stickyValues'),
(5, 'POGT_target',     'POGT target — stored in stickyValues'),
(6, 'DAT_actual',      'POGT - IWT — computed and stored on each save');

-- ---------------------------------------------------------------------------
-- Per-site equipment configuration  (one row per site)
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
    CONSTRAINT FK_siteConfig_site FOREIGN KEY (siteId) REFERENCES siteListASU(id) ON DELETE CASCADE,
    CONSTRAINT UQ_siteConfig_site UNIQUE (siteId)
);

-- ---------------------------------------------------------------------------
-- Equipment catalog  (one row = one physical cooling circuit per site)
-- Rows are enabled/disabled by the Configuration popup.
-- ---------------------------------------------------------------------------
CREATE TABLE coolingTowerData (
    id              INT           NOT NULL IDENTITY(1,1) PRIMARY KEY,
    siteId          INT           NOT NULL,
    equipmentId     INT           NOT NULL,
    equipmentNumber INT           NOT NULL,
    parameter       NVARCHAR(255) NOT NULL,
    enabled         NVARCHAR(10)  NOT NULL DEFAULT 'False',
    CONSTRAINT FK_ctd_site   FOREIGN KEY (siteId)      REFERENCES siteListASU(id),
    CONSTRAINT FK_ctd_eqType FOREIGN KEY (equipmentId) REFERENCES equipmentType(id)
);

CREATE UNIQUE INDEX UX_ctd_site_eq_num ON coolingTowerData (siteId, equipmentId, equipmentNumber);
CREATE INDEX IX_ctd_site_enabled      ON coolingTowerData (siteId, enabled);

-- ---------------------------------------------------------------------------
-- Time-series readings
-- ---------------------------------------------------------------------------
CREATE TABLE coolingTowerDataHistory (
    id                 INT      NOT NULL IDENTITY(1,1) PRIMARY KEY,
    coolingTowerDataID INT      NOT NULL,
    parameterTypesID   INT      NOT NULL,
    t_stamp            DATETIME NOT NULL,
    value              FLOAT    NULL,
    submittedBy        NVARCHAR(100) NULL,
    CONSTRAINT FK_ctdh_ctd   FOREIGN KEY (coolingTowerDataID) REFERENCES coolingTowerData(id) ON DELETE CASCADE,
    CONSTRAINT FK_ctdh_param FOREIGN KEY (parameterTypesID)   REFERENCES parameterTypes(id)
);

CREATE INDEX IX_ctdh_id_stamp    ON coolingTowerDataHistory (coolingTowerDataID, t_stamp DESC);
CREATE INDEX IX_ctdh_param_stamp ON coolingTowerDataHistory (parameterTypesID,   t_stamp DESC);
CREATE INDEX IX_ctdh_site_stamp  ON coolingTowerDataHistory (t_stamp DESC);

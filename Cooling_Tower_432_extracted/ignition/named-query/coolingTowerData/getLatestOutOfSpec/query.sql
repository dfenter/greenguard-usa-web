-- Get the most recent recorded value for each coolingTowerDataID + paramType,
-- then compute deviations for all three spec parameters across every piece of
-- equipment at the site.  Returns one row per equipment+paramType with its
-- deviation so the caller can determine worst-case status.
--
-- parameterTypesID key:
--   1 = designIncomingWaterTempF  (IWT actual)
--   2 = processGasOutTempF        (POGT actual)
--   3 = designApproachTempFTarget (not used here - stored as sticky)
--   4 = designIncomingWaterTempFTarget (not used here - stored as sticky)
--   5 = processGasOutTempFTarget  (not used here - stored as sticky)
--   6 = designApproachTempF       (DAT actual = POGT - IWT, stored on save)

WITH LatestActuals AS (
    SELECT
        h.coolingTowerDataID,
        h.parameterTypesID,
        h.value,
        ROW_NUMBER() OVER (
            PARTITION BY h.coolingTowerDataID, h.parameterTypesID
            ORDER BY h.t_stamp DESC
        ) AS rn
    FROM coolingTowerDataHistory h
    INNER JOIN coolingTowerData c ON h.coolingTowerDataID = c.id
    WHERE c.siteId = :siteId
      AND c.enabled = 'True'
      AND h.parameterTypesID IN (1, 2, 6)
)
SELECT
    la.coolingTowerDataID,
    la.parameterTypesID,
    la.value AS actualValue,
    sv.approachTempTarget,
    sv.incomingWaterTempTarget,
    sv.processGasOutTempTarget,
    CASE
        WHEN la.parameterTypesID = 6 AND sv.approachTempTarget IS NOT NULL
            THEN la.value - sv.approachTempTarget
        WHEN la.parameterTypesID = 1 AND sv.incomingWaterTempTarget IS NOT NULL
            THEN la.value - sv.incomingWaterTempTarget
        WHEN la.parameterTypesID = 2 AND sv.processGasOutTempTarget IS NOT NULL
            THEN la.value - sv.processGasOutTempTarget
        ELSE NULL
    END AS deviation
FROM LatestActuals la
LEFT JOIN coolingTowerStickyValues sv
    ON la.coolingTowerDataID = sv.coolingTowerDataID
WHERE la.rn = 1

WITH Latest AS (
    SELECT h.coolingTowerDataID, h.parameterTypesID, h.value,
           ROW_NUMBER() OVER (PARTITION BY h.coolingTowerDataID, h.parameterTypesID
                              ORDER BY h.t_stamp DESC) AS rn
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
        WHEN la.parameterTypesID = 6 AND sv.approachTempTarget      IS NOT NULL THEN la.value - sv.approachTempTarget
        WHEN la.parameterTypesID = 1 AND sv.incomingWaterTempTarget IS NOT NULL THEN la.value - sv.incomingWaterTempTarget
        WHEN la.parameterTypesID = 2 AND sv.processGasOutTempTarget IS NOT NULL THEN la.value - sv.processGasOutTempTarget
        ELSE NULL
    END AS deviation
FROM Latest la
LEFT JOIN coolingTowerStickyValues sv ON la.coolingTowerDataID = sv.coolingTowerDataID
WHERE la.rn = 1

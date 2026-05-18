WITH LatestEntry AS (
    SELECT c.siteId, MAX(h.t_stamp) AS lastEntry
    FROM coolingTowerDataHistory h
    INNER JOIN coolingTowerData c ON h.coolingTowerDataID = c.id
    WHERE c.enabled = 'True'
    GROUP BY c.siteId
),
LatestActuals AS (
    SELECT h.coolingTowerDataID, h.parameterTypesID, h.value,
           ROW_NUMBER() OVER (PARTITION BY h.coolingTowerDataID, h.parameterTypesID
                              ORDER BY h.t_stamp DESC) AS rn
    FROM coolingTowerDataHistory h
    INNER JOIN coolingTowerData c ON h.coolingTowerDataID = c.id
    WHERE c.enabled = 'True' AND h.parameterTypesID IN (1, 2, 6)
),
Deviations AS (
    SELECT la.coolingTowerDataID, c.siteId,
        ABS(CASE
            WHEN la.parameterTypesID = 6 AND sv.approachTempTarget      IS NOT NULL THEN la.value - sv.approachTempTarget
            WHEN la.parameterTypesID = 1 AND sv.incomingWaterTempTarget IS NOT NULL THEN la.value - sv.incomingWaterTempTarget
            WHEN la.parameterTypesID = 2 AND sv.processGasOutTempTarget IS NOT NULL THEN la.value - sv.processGasOutTempTarget
            ELSE NULL
        END) AS absDev
    FROM LatestActuals la
    INNER JOIN coolingTowerData c ON la.coolingTowerDataID = c.id
    LEFT  JOIN coolingTowerStickyValues sv ON la.coolingTowerDataID = sv.coolingTowerDataID
    WHERE la.rn = 1
),
WorstDev AS (
    SELECT siteId, MAX(absDev) AS worstDev
    FROM Deviations GROUP BY siteId
),
EnabledCount AS (
    SELECT siteId, COUNT(*) AS enabledEquipment
    FROM coolingTowerData WHERE enabled = 'True' GROUP BY siteId
),
DataThisMonth AS (
    SELECT c.siteId, COUNT(DISTINCT h.coolingTowerDataID) AS equipWithData
    FROM coolingTowerDataHistory h
    INNER JOIN coolingTowerData c ON h.coolingTowerDataID = c.id
    WHERE c.enabled = 'True'
      AND h.t_stamp >= DATEADD(month, -1, GETDATE())
      AND h.parameterTypesID = 6
    GROUP BY c.siteId
)
SELECT
    s.id                                                                AS siteId,
    s.site                                                              AS siteName,
    s.region,
    le.lastEntry,
    DATEDIFF(day, le.lastEntry, GETDATE())                              AS daysSinceEntry,
    COALESCE(wd.worstDev, 0)                                            AS worstDev,
    COALESCE(ec.enabledEquipment, 0)                                    AS enabledEquipment,
    COALESCE(dm.equipWithData, 0)                                       AS equipWithDataThisMonth,
    CASE WHEN COALESCE(ec.enabledEquipment, 0) > 0
         THEN CAST(ROUND(100.0 * COALESCE(dm.equipWithData,0) / ec.enabledEquipment, 0) AS INT)
         ELSE 0 END                                                     AS completenessPercent
FROM siteListASU s
LEFT JOIN LatestEntry  le ON s.id = le.siteId
LEFT JOIN WorstDev     wd ON s.id = wd.siteId
LEFT JOIN EnabledCount ec ON s.id = ec.siteId
LEFT JOIN DataThisMonth dm ON s.id = dm.siteId
WHERE s.region IS NOT NULL AND s.region <> ''
ORDER BY s.region ASC, s.site ASC

SELECT
    YEAR(h.t_stamp)  AS yr,
    MONTH(h.t_stamp) AS mo,
    COUNT(DISTINCT h.coolingTowerDataID) AS equipSubmitted,
    (SELECT COUNT(*) FROM coolingTowerData WHERE siteId = :siteId AND enabled = 'True') AS totalEnabled,
    CASE
        WHEN (SELECT COUNT(*) FROM coolingTowerData WHERE siteId = :siteId AND enabled = 'True') > 0
        THEN CAST(ROUND(100.0 * COUNT(DISTINCT h.coolingTowerDataID) /
             (SELECT COUNT(*) FROM coolingTowerData WHERE siteId = :siteId AND enabled = 'True'), 0) AS INT)
        ELSE 0
    END AS completenessPercent
FROM coolingTowerDataHistory h
INNER JOIN coolingTowerData c ON h.coolingTowerDataID = c.id
WHERE c.siteId = :siteId
  AND c.enabled = 'True'
  AND h.parameterTypesID = 6
  AND h.t_stamp >= DATEADD(month, -12, GETDATE())
GROUP BY YEAR(h.t_stamp), MONTH(h.t_stamp)
ORDER BY yr ASC, mo ASC

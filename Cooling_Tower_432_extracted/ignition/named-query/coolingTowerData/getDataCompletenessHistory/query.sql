SELECT
    YEAR(h.t_stamp)  AS yr,
    MONTH(h.t_stamp) AS mo,
    COUNT(DISTINCT h.coolingTowerDataID) AS equipSubmitted
FROM coolingTowerDataHistory h
INNER JOIN coolingTowerData c ON h.coolingTowerDataID = c.id
WHERE c.siteId = :siteId
  AND c.enabled = 'True'
  AND h.parameterTypesID = 6
  AND h.t_stamp >= DATEADD(month, -12, GETDATE())
GROUP BY YEAR(h.t_stamp), MONTH(h.t_stamp)
ORDER BY yr, mo

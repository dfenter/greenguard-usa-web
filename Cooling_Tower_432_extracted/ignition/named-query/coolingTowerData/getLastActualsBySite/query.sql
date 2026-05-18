-- Returns most recent actual readings per coolingTowerDataID for pre-population
WITH LatestActuals AS (
    SELECT h.coolingTowerDataID, h.parameterTypesID, h.value,
           ROW_NUMBER() OVER (PARTITION BY h.coolingTowerDataID, h.parameterTypesID
                              ORDER BY h.t_stamp DESC) AS rn
    FROM coolingTowerDataHistory h
    INNER JOIN coolingTowerData c ON h.coolingTowerDataID = c.id
    WHERE c.siteId = :siteId
      AND c.enabled = 'True'
      AND h.parameterTypesID IN (1, 2, 6)
)
SELECT la.coolingTowerDataID, la.parameterTypesID, la.value
FROM LatestActuals la
WHERE la.rn = 1

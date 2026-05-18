SELECT
    h.t_stamp,
    h.coolingTowerDataID,
    h.parameterTypesID,
    h.value,
    h.submittedBy,
    COALESCE(sv.altEquipmentName, c.parameter) AS equipmentName,
    CASE h.parameterTypesID
        WHEN 1 THEN 'IWT Actual'   WHEN 2 THEN 'POGT Actual'
        WHEN 3 THEN 'DAT Target'   WHEN 4 THEN 'IWT Target'
        WHEN 5 THEN 'POGT Target'  WHEN 6 THEN 'DAT Actual'
    END AS paramLabel,
    COALESCE(sv.altEquipmentName, c.parameter) + ' - ' +
    CASE h.parameterTypesID
        WHEN 1 THEN 'IWT Actual'   WHEN 2 THEN 'POGT Actual'
        WHEN 3 THEN 'DAT Target'   WHEN 4 THEN 'IWT Target'
        WHEN 5 THEN 'POGT Target'  WHEN 6 THEN 'DAT Actual'
    END AS seriesName
FROM coolingTowerDataHistory h
INNER JOIN coolingTowerData c ON h.coolingTowerDataID = c.id
LEFT  JOIN coolingTowerStickyValues sv ON h.coolingTowerDataID = sv.coolingTowerDataID
WHERE c.siteId  = :siteId
  AND c.enabled = 'True'
  AND h.t_stamp >= :startDate
  AND h.t_stamp <= :endDate
ORDER BY c.parameter, h.parameterTypesID, h.t_stamp ASC

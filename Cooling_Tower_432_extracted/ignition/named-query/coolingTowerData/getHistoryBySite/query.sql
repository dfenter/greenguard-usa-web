-- History for all enabled equipment at a site between startDate and endDate.
-- parameterTypesID:
--   1=IWT actual  2=POGT actual  3=DAT target
--   4=IWT target  5=POGT target  6=DAT actual
SELECT
    h.t_stamp,
    h.coolingTowerDataID,
    h.parameterTypesID,
    h.value,
    c.parameter                                     AS equipmentName,
    CASE h.parameterTypesID
        WHEN 1 THEN 'IWT Actual'
        WHEN 2 THEN 'POGT Actual'
        WHEN 3 THEN 'DAT Target'
        WHEN 4 THEN 'IWT Target'
        WHEN 5 THEN 'POGT Target'
        WHEN 6 THEN 'DAT Actual'
    END                                             AS paramLabel,
    c.parameter + ' - ' +
    CASE h.parameterTypesID
        WHEN 1 THEN 'IWT Actual'
        WHEN 2 THEN 'POGT Actual'
        WHEN 3 THEN 'DAT Target'
        WHEN 4 THEN 'IWT Target'
        WHEN 5 THEN 'POGT Target'
        WHEN 6 THEN 'DAT Actual'
    END                                             AS seriesName
FROM coolingTowerDataHistory h
INNER JOIN coolingTowerData c ON h.coolingTowerDataID = c.id
WHERE c.siteId   = :siteId
  AND c.enabled  = 'True'
  AND h.t_stamp >= :startDate
  AND h.t_stamp <= :endDate
ORDER BY c.parameter, h.parameterTypesID, h.t_stamp ASC

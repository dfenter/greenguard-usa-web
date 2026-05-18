SELECT id, t_stamp, note, submittedBy
FROM coolingTowerDataNotes
WHERE siteId = :siteId
  AND t_stamp >= :startDate
  AND t_stamp <= :endDate
ORDER BY t_stamp DESC

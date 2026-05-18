SELECT DISTINCT region
FROM siteListASU
WHERE region IS NOT NULL AND region <> ''
ORDER BY region ASC

SELECT id, site
FROM siteListASU
WHERE region = :region
ORDER BY site ASC

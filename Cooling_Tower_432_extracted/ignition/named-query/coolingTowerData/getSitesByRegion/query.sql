-- Returns all sites in a region, ordered alphabetically.
-- Requires a 'region' column on siteListASU.
SELECT id, site
FROM siteListASU
WHERE region = :region
ORDER BY site ASC

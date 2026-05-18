-- Run this ALTER TABLE to add the region column to siteListASU.
-- Then run the UPDATE statements below to populate initial region assignments
-- based on the current hardcoded values in the project.

ALTER TABLE siteListASU
ADD region NVARCHAR(100) NULL;

-- Populate initial region assignments from current project configuration
-- Central Region
UPDATE siteListASU SET region = 'Central Region'    WHERE site IN ('Irving','Lawton','Mulberry','Odessa','Waxahachie','Penwell');
-- East Region
UPDATE siteListASU SET region = 'East Region'       WHERE site IN ('Cayce','Gaston','Spartanburg Brooks','Spartanburg Sha','Wake Forest');
-- Midwest Region
UPDATE siteListASU SET region = 'Midwest Region'    WHERE site IN ('Burlington','Carrollton','Mapleton','Mt Vernon','Pittsboro');
-- North Region
UPDATE siteListASU SET region = 'North Region'      WHERE site IN ('Dickinson','Grimes','Norfolk','Waverly');
-- Northeast Region
UPDATE siteListASU SET region = 'Northeast Region'  WHERE site IN ('Albany','Middletown','St Marys','Toledo','West Point');
-- South Region
UPDATE siteListASU SET region = 'South Region'      WHERE site IN ('San Antonio','Seguin','Stafford','Westlake');
-- Southeast Region
UPDATE siteListASU SET region = 'Southeast Region'  WHERE site IN ('Chattanooga','De Lisle','Lakeland','Orlando','WPB');
-- Southwest Region
UPDATE siteListASU SET region = 'Southwest Region'  WHERE site IN ('Albuquerque','Irwindale','Kapolei','Mesa','Vacaville','Vernon');

-- Verify
SELECT region, COUNT(*) AS siteCount, STRING_AGG(site, ', ') AS sites
FROM siteListASU
GROUP BY region
ORDER BY region;

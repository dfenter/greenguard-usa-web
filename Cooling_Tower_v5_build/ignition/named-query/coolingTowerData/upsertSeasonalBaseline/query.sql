MERGE INTO coolingTowerSeasonalBaseline AS target
USING (SELECT :siteId AS siteId, :month AS month) AS src
ON target.siteId = src.siteId AND target.month = src.month
WHEN MATCHED     THEN UPDATE SET baselineDAT = :baselineDAT
WHEN NOT MATCHED THEN INSERT (siteId, month, baselineDAT)
                      VALUES (:siteId, :month, :baselineDAT);

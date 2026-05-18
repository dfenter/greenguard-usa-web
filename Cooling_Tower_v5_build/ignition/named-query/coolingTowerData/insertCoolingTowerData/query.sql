MERGE INTO coolingTowerDataHistory AS target
USING (
    SELECT coolingTowerDataID, parameterTypesID, t_stamp, value, submittedBy
    FROM OPENJSON(:rows)
    WITH (
        coolingTowerDataID  int,
        parameterTypesID    int,
        t_stamp             datetime,
        value               float,
        submittedBy         nvarchar(100)
    )
) AS src
ON  target.coolingTowerDataID = src.coolingTowerDataID
AND target.parameterTypesID   = src.parameterTypesID
AND CAST(target.t_stamp AS date) = CAST(src.t_stamp AS date)
WHEN MATCHED THEN
    UPDATE SET target.value       = src.value,
               target.t_stamp     = src.t_stamp,
               target.submittedBy = src.submittedBy
WHEN NOT MATCHED THEN
    INSERT (coolingTowerDataID, parameterTypesID, t_stamp, value, submittedBy)
    VALUES (src.coolingTowerDataID, src.parameterTypesID, src.t_stamp, src.value, src.submittedBy);

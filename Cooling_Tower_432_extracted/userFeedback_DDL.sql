-- Run once to create the userFeedback table referenced by the User Feedback form.
CREATE TABLE userFeedback (
    id          INT            NOT NULL IDENTITY(1,1) PRIMARY KEY,
    site        NVARCHAR(100)  NOT NULL,
    username    NVARCHAR(100)  NULL,
    category    NVARCHAR(50)   NOT NULL,
    feedback    NVARCHAR(2000) NOT NULL,
    t_stamp     DATETIME       NOT NULL DEFAULT GETDATE()
);

CREATE INDEX IX_userFeedback_site_stamp ON userFeedback (site, t_stamp DESC);

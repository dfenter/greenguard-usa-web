INSERT INTO userFeedback (site, username, category, feedback, t_stamp)
VALUES (:site, :username, :category, :feedback, GETDATE())

UPDATE siteConfig
SET MAC=:MAC , BAC=:BAC, RNC=:RNC, FNC=:FNC, GOX=:GOX, GAN=:GAN, CDA=:CDA, chiller=:chiller, NLUChiller=:NLUChiller, airExpander=:airExpander, auxillaryCooler=:auxillaryCooler, coldExpander=:coldExpander, DCAC=:DCAC, argonSkid=:argonSkid, warmExpander=:warmExpander
WHERE "siteId" = :siteId;
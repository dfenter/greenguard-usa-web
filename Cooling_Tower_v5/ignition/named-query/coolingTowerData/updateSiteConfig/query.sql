UPDATE siteConfig
SET MAC=:MAC, BAC=:BAC, RNC=:RNC, FNC=:FNC, GOX=:GOX, GAN=:GAN, CDA=:CDA,
    chiller=:chiller, NLUChiller=:NLUChiller, airExpander=:airExpander,
    warmExpander=:warmExpander, coldExpander=:coldExpander, argonSkid=:argonSkid,
    auxillaryCooler=:auxillaryCooler, DCAC=:DCAC
WHERE siteId = :siteId

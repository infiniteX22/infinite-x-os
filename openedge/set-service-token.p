DEFINE VARIABLE cToken AS CHARACTER NO-UNDO.
cToken = SESSION:PARAMETER.
IF LENGTH(cToken) < 32 THEN DO:
  PUT UNFORMATTED "OPENEDGE_TOKEN_ERROR=Token too short" SKIP.
  QUIT.
END.
DO TRANSACTION:
  FIND IXRepositoryMeta EXCLUSIVE-LOCK WHERE IXRepositoryMeta.MetaKey = "service-token" NO-ERROR.
  IF NOT AVAILABLE IXRepositoryMeta THEN DO:
    CREATE IXRepositoryMeta.
    IXRepositoryMeta.MetaKey = "service-token".
  END.
  ASSIGN IXRepositoryMeta.MetaValue = cToken IXRepositoryMeta.UpdatedAt = NOW.
END.
PUT UNFORMATTED "OPENEDGE_TOKEN_OK" SKIP.
QUIT.

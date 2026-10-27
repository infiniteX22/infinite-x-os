COMPILE InfiniteX/BusinessRules.cls SAVE.
IF COMPILER:ERROR THEN DO:
  MESSAGE "BusinessRules compile failed".
  QUIT.
END.
COMPILE OperationsService.p SAVE.
IF COMPILER:ERROR THEN DO:
  MESSAGE "OperationsService compile failed".
  QUIT.
END.
MESSAGE "ABL compile succeeded".
QUIT.

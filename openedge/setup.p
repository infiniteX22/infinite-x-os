DEFINE VARIABLE cSchema AS CHARACTER NO-UNDO.
cSchema = SESSION:PARAMETER.
IF cSchema = "" THEN cSchema = "openedge/infinite-x.df".
RUN prodict/load_df.p (cSchema).
IF ERROR-STATUS:ERROR THEN DO:
  MESSAGE "Schema load failed" VIEW-AS ALERT-BOX ERROR.
  QUIT.
END.
MESSAGE "Schema loaded:" cSchema.
QUIT.

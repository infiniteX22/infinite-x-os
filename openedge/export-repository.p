USING Progress.Json.ObjectModel.*.

DEFINE VARIABLE cParts AS CHARACTER EXTENT 3 NO-UNDO.
DEFINE VARIABLE cMode AS CHARACTER NO-UNDO.
DEFINE VARIABLE cOutputFile AS CHARACTER NO-UNDO.
DEFINE VARIABLE cToken AS CHARACTER NO-UNDO.
DEFINE VARIABLE oRoot AS JsonObject NO-UNDO.
DEFINE VARIABLE oRecords AS JsonArray NO-UNDO.
DEFINE VARIABLE oRecord AS JsonObject NO-UNDO.

ASSIGN cParts = SESSION:PARAMETER
       cMode = ENTRY(1, SESSION:PARAMETER, "|")
       cOutputFile = ENTRY(2, SESSION:PARAMETER, "|")
       cToken = ENTRY(3, SESSION:PARAMETER, "|").

IF cMode <> "DEMO" AND cMode <> "REAL" THEN DO:
  PUT UNFORMATTED "OPENEDGE_EXPORT_ERROR=Invalid mode" SKIP.
  QUIT.
END.

FIND IXRepositoryMeta NO-LOCK WHERE IXRepositoryMeta.MetaKey = "service-token" NO-ERROR.
IF NOT AVAILABLE IXRepositoryMeta OR IXRepositoryMeta.MetaValue <> cToken THEN DO:
  PUT UNFORMATTED "OPENEDGE_EXPORT_ERROR=Service token rejected" SKIP.
  QUIT.
END.

oRoot = NEW JsonObject().
oRecords = NEW JsonArray().
FOR EACH IXRepositoryRecord NO-LOCK WHERE IXRepositoryRecord.ModeCode = cMode:
  oRecord = NEW JsonObject().
  oRecord:Add("entity", IXRepositoryRecord.EntityName).
  oRecord:Add("id", IXRepositoryRecord.RecordId).
  oRecord:Add("relationOne", IXRepositoryRecord.RelationOne).
  oRecord:Add("relationTwo", IXRepositoryRecord.RelationTwo).
  oRecord:Add("payload", IXRepositoryRecord.PayloadBase64).
  oRecords:Add(oRecord).
END.
oRoot:Add("mode", cMode).
FIND IXRepositoryMeta NO-LOCK WHERE IXRepositoryMeta.MetaKey = "revision-" + cMode NO-ERROR.
oRoot:Add("revision", IF AVAILABLE IXRepositoryMeta THEN IXRepositoryMeta.MetaValue ELSE "").
oRoot:Add("records", oRecords).
oRoot:WriteFile(cOutputFile, TRUE).
PUT UNFORMATTED "OPENEDGE_EXPORT_OK=" cMode "|" oRecords:Length SKIP.
QUIT.

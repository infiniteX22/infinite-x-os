USING Progress.Json.ObjectModel.*.
USING Progress.Lang.*.
USING InfiniteX.BusinessRules.

DEFINE VARIABLE cInputFile AS CHARACTER NO-UNDO.
DEFINE VARIABLE oParser AS ObjectModelParser NO-UNDO.
DEFINE VARIABLE oRoot AS JsonObject NO-UNDO.
DEFINE VARIABLE oRecords AS JsonArray NO-UNDO.
DEFINE VARIABLE oRecord AS JsonObject NO-UNDO.
DEFINE VARIABLE cMode AS CHARACTER NO-UNDO.
DEFINE VARIABLE cActor AS CHARACTER NO-UNDO.
DEFINE VARIABLE cRole AS CHARACTER NO-UNDO.
DEFINE VARIABLE cOperation AS CHARACTER NO-UNDO.
DEFINE VARIABLE cRevision AS CHARACTER NO-UNDO.
DEFINE VARIABLE cEntity AS CHARACTER NO-UNDO.
DEFINE VARIABLE cId AS CHARACTER NO-UNDO.
DEFINE VARIABLE cRelationOne AS CHARACTER NO-UNDO.
DEFINE VARIABLE cRelationTwo AS CHARACTER NO-UNDO.
DEFINE VARIABLE cPayload AS CHARACTER NO-UNDO.
DEFINE VARIABLE iRecord AS INTEGER NO-UNDO.

FUNCTION AllowedEntity RETURNS LOGICAL (INPUT pcEntity AS CHARACTER):
  RETURN LOOKUP(pcEntity,
    "clients,projects,users,tasks,task_updates,milestones,tenders,tender_requirements,quotations,invoices,payments,expenses,funding,funding_documents,compliance_items,documents,meetings,meeting_actions,notification_jobs,outbox,wayne_messages,wayne_meetings,wayne_transcript_events,wayne_session_summaries,wayne_privacy_settings,provider_deletion_jobs,avatar_sessions,audit_log,connector_status,company_settings") > 0.
END FUNCTION.

FUNCTION RoleCanWrite RETURNS LOGICAL (INPUT pcRole AS CHARACTER, INPUT pcOperation AS CHARACTER):
  IF pcRole = "System" OR pcRole = "Director" THEN RETURN TRUE.
  IF pcRole = "Project Manager" THEN RETURN LOOKUP(pcOperation,"projects,tasks,task_updates,milestones,documents,compliance_items,meetings,meeting_actions,notification_jobs,outbox,wayne_messages,wayne_meetings,wayne_transcript_events,wayne_session_summaries,avatar_sessions") > 0.
  IF pcRole = "Electrician" THEN RETURN LOOKUP(pcOperation,"tasks,task_updates,documents,wayne_messages,wayne_meetings,wayne_transcript_events,wayne_session_summaries,avatar_sessions") > 0.
  IF pcRole = "Finance" THEN RETURN LOOKUP(pcOperation,"quotations,invoices,payments,expenses,funding,funding_documents,documents,wayne_messages,wayne_meetings,wayne_transcript_events,wayne_session_summaries,avatar_sessions") > 0.
  IF pcRole = "Estimator" THEN RETURN LOOKUP(pcOperation,"tenders,tender_requirements,documents,wayne_messages,wayne_meetings,wayne_transcript_events,wayne_session_summaries,avatar_sessions") > 0.
  RETURN FALSE.
END FUNCTION.

cInputFile = SESSION:PARAMETER.
IF cInputFile = "" OR SEARCH(cInputFile) = ? THEN DO:
  PUT UNFORMATTED "OPENEDGE_SYNC_ERROR=Input snapshot not found" SKIP.
  QUIT.
END.

oParser = NEW ObjectModelParser().
oRoot = CAST(oParser:ParseFile(cInputFile), JsonObject).
ASSIGN
  cMode = oRoot:GetCharacter("mode")
  cActor = oRoot:GetCharacter("actor")
  cRole = oRoot:GetCharacter("role")
  cOperation = oRoot:GetCharacter("operation")
  cRevision = oRoot:GetCharacter("revision")
  oRecords = oRoot:GetJsonArray("records").

BusinessRules:ValidateMode(cMode).
IF NOT RoleCanWrite(cRole,cOperation) THEN
  UNDO, THROW NEW AppError("OpenEdge service denied this operation for the supplied role.", 0).

DO TRANSACTION:
  FOR EACH IXRepositoryRecord EXCLUSIVE-LOCK WHERE IXRepositoryRecord.ModeCode = cMode:
    DELETE IXRepositoryRecord.
  END.
  DO iRecord = 1 TO oRecords:Length:
    oRecord = oRecords:GetJsonObject(iRecord).
    ASSIGN
      cEntity = oRecord:GetCharacter("entity")
      cId = oRecord:GetCharacter("id")
      cRelationOne = oRecord:GetCharacter("relationOne")
      cRelationTwo = oRecord:GetCharacter("relationTwo")
      cPayload = oRecord:GetCharacter("payload").
    IF NOT AllowedEntity(cEntity) THEN
      UNDO, THROW NEW AppError("Unsupported repository entity: " + cEntity, 0).
    IF cId = "" OR LENGTH(cId) > 100 OR LENGTH(cPayload) > 30000 THEN
      UNDO, THROW NEW AppError("Invalid repository record payload.", 0).
    CREATE IXRepositoryRecord.
    ASSIGN
      IXRepositoryRecord.ModeCode = cMode
      IXRepositoryRecord.EntityName = cEntity
      IXRepositoryRecord.RecordId = cId
      IXRepositoryRecord.RelationOne = cRelationOne
      IXRepositoryRecord.RelationTwo = cRelationTwo
      IXRepositoryRecord.PayloadBase64 = cPayload
      IXRepositoryRecord.UpdatedAt = NOW.
  END.
  FIND IXRepositoryMeta EXCLUSIVE-LOCK WHERE IXRepositoryMeta.MetaKey = "revision-" + cMode NO-ERROR.
  IF NOT AVAILABLE IXRepositoryMeta THEN DO:
    CREATE IXRepositoryMeta.
    IXRepositoryMeta.MetaKey = "revision-" + cMode.
  END.
  ASSIGN IXRepositoryMeta.MetaValue = cRevision IXRepositoryMeta.UpdatedAt = NOW.
  FIND IXRepositoryMeta EXCLUSIVE-LOCK WHERE IXRepositoryMeta.MetaKey = "last-actor-" + cMode NO-ERROR.
  IF NOT AVAILABLE IXRepositoryMeta THEN DO:
    CREATE IXRepositoryMeta.
    IXRepositoryMeta.MetaKey = "last-actor-" + cMode.
  END.
  ASSIGN IXRepositoryMeta.MetaValue = cActor + "|" + cRole + "|" + cOperation IXRepositoryMeta.UpdatedAt = NOW.
END.

PUT UNFORMATTED "OPENEDGE_SYNC_OK=" cMode "|" cRevision "|" oRecords:Length SKIP.
QUIT.

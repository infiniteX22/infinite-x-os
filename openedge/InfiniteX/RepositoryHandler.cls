USING OpenEdge.Core.String.
USING OpenEdge.Net.HTTP.IHttpResponse.
USING OpenEdge.Web.IWebRequest.
USING OpenEdge.Web.WebHandler.
USING OpenEdge.Web.WebResponse.
USING OpenEdge.Web.WebResponseWriter.
USING Progress.Json.ObjectModel.JsonArray.
USING Progress.Json.ObjectModel.JsonObject.

CLASS InfiniteX.RepositoryHandler INHERITS WebHandler:

  METHOD PRIVATE INTEGER WriteJson(INPUT poBody AS JsonObject, INPUT piStatus AS INTEGER):
    DEFINE VARIABLE oResponse AS IHttpResponse NO-UNDO.
    DEFINE VARIABLE oWriter AS WebResponseWriter NO-UNDO.
    DEFINE VARIABLE oText AS String NO-UNDO.
    DEFINE VARIABLE lcJson AS LONGCHAR NO-UNDO.
    poBody:Write(lcJson, FALSE).
    ASSIGN
      oText = NEW String(STRING(lcJson))
      oResponse = NEW WebResponse()
      oResponse:StatusCode = piStatus
      oResponse:ContentType = "application/json":U
      oResponse:Entity = oText
      oResponse:ContentLength = oText:Size
      oWriter = NEW WebResponseWriter(oResponse).
    oWriter:Open().
    oWriter:Close().
    RETURN 0.
  END METHOD.

  METHOD PRIVATE LOGICAL Authorised(INPUT poRequest AS IWebRequest):
    DEFINE VARIABLE cExpected AS CHARACTER NO-UNDO.
    FIND IXRepositoryMeta WHERE IXRepositoryMeta.MetaKey = "service-token" NO-ERROR.
    IF AVAILABLE IXRepositoryMeta THEN cExpected = IXRepositoryMeta.MetaValue.
    RETURN cExpected <> "" AND poRequest:GetHeader("X-IX-Service-Token"):Value = cExpected.
  END METHOD.

  METHOD OVERRIDE PROTECTED INTEGER HandleGet(INPUT poRequest AS IWebRequest):
    DEFINE VARIABLE oBody AS JsonObject NO-UNDO.
    DEFINE VARIABLE oRows AS JsonArray NO-UNDO.
    DEFINE VARIABLE oRow AS JsonObject NO-UNDO.
    DEFINE VARIABLE cMode AS CHARACTER NO-UNDO.
    DEFINE VARIABLE cEntity AS CHARACTER NO-UNDO.
    oBody = NEW JsonObject().
    IF NOT Authorised(poRequest) THEN DO:
      oBody:Add("error", "OpenEdge service token is required.").
      RETURN WriteJson(oBody, 401).
    END.
    ASSIGN
      cMode = CAPS(STRING(poRequest:GetPathParameter("mode")))
      cEntity = STRING(poRequest:GetPathParameter("entity")).
    IF cMode = ? OR cMode = "" THEN DO:
      oBody:Add("ok", TRUE).
      oBody:Add("repository", "OpenEdge").
      FIND IXRepositoryMeta WHERE IXRepositoryMeta.MetaKey = "revision-DEMO" NO-ERROR.
      oBody:Add("demoRevision", IF AVAILABLE IXRepositoryMeta THEN IXRepositoryMeta.MetaValue ELSE "").
      FIND IXRepositoryMeta WHERE IXRepositoryMeta.MetaKey = "revision-REAL" NO-ERROR.
      oBody:Add("realRevision", IF AVAILABLE IXRepositoryMeta THEN IXRepositoryMeta.MetaValue ELSE "").
      RETURN WriteJson(oBody, 200).
    END.
    IF LOOKUP(cMode, "DEMO,REAL") = 0 THEN DO:
      oBody:Add("error", "Mode must be DEMO or REAL.").
      RETURN WriteJson(oBody, 400).
    END.
    oRows = NEW JsonArray().
    FOR EACH IXRepositoryRecord WHERE IXRepositoryRecord.ModeCode = cMode
      AND (cEntity = "" OR cEntity = ? OR IXRepositoryRecord.EntityName = cEntity)
      BY IXRepositoryRecord.EntityName BY IXRepositoryRecord.RecordId:
      oRow = NEW JsonObject().
      oRow:Add("entity", IXRepositoryRecord.EntityName).
      oRow:Add("id", IXRepositoryRecord.RecordId).
      oRow:Add("relationOne", IXRepositoryRecord.RelationOne).
      oRow:Add("relationTwo", IXRepositoryRecord.RelationTwo).
      oRow:Add("payload", IXRepositoryRecord.PayloadBase64).
      oRow:Add("updatedAt", STRING(IXRepositoryRecord.UpdatedAt)).
      oRows:Add(oRow).
    END.
    oBody:Add("mode", cMode).
    oBody:Add("entity", IF cEntity = ? THEN "" ELSE cEntity).
    oBody:Add("records", oRows).
    RETURN WriteJson(oBody, 200).
  END METHOD.

  METHOD OVERRIDE PROTECTED INTEGER HandleNotAllowedMethod(INPUT poRequest AS IWebRequest):
    DEFINE VARIABLE oBody AS JsonObject NO-UNDO.
    oBody = NEW JsonObject().
    oBody:Add("error", "Method not allowed.").
    RETURN WriteJson(oBody, 405).
  END METHOD.

  METHOD OVERRIDE PROTECTED INTEGER HandleNotImplemented(INPUT poRequest AS IWebRequest):
    DEFINE VARIABLE oBody AS JsonObject NO-UNDO.
    oBody = NEW JsonObject().
    oBody:Add("error", "Method not implemented.").
    RETURN WriteJson(oBody, 501).
  END METHOD.
END CLASS.

/* PAS for OpenEdge business-service procedure. Requires an OpenEdge installation
   and a generated REST mapping before deployment. It is not executed by the
   local fallback runtime. */
USING Progress.Json.ObjectModel.*.
USING Progress.Lang.*.
USING InfiniteX.BusinessRules.

DEFINE TEMP-TABLE ttTenderReadiness NO-UNDO
  FIELD TenderId AS CHARACTER
  FIELD Score AS INTEGER
  FIELD MandatoryCount AS INTEGER
  FIELD VerifiedCount AS INTEGER
  FIELD MissingCount AS INTEGER
  FIELD UnverifiedCount AS INTEGER
  FIELD SubmissionReady AS LOGICAL.

PROCEDURE GetTenderReadiness:
  DEFINE INPUT PARAMETER pcMode AS CHARACTER NO-UNDO.
  DEFINE INPUT PARAMETER pcTenderId AS CHARACTER NO-UNDO.
  DEFINE OUTPUT PARAMETER TABLE FOR ttTenderReadiness.
  DEFINE VARIABLE iMandatory AS INTEGER NO-UNDO.
  DEFINE VARIABLE iVerified AS INTEGER NO-UNDO.
  DEFINE VARIABLE iMissing AS INTEGER NO-UNDO.
  DEFINE VARIABLE iUnverified AS INTEGER NO-UNDO.

  BusinessRules:ValidateMode(pcMode).
  FOR EACH IXTenderRequirement NO-LOCK
      WHERE IXTenderRequirement.ModeCode = pcMode
        AND IXTenderRequirement.TenderId = pcTenderId
        AND IXTenderRequirement.Mandatory = TRUE:
    iMandatory = iMandatory + 1.
    CASE IXTenderRequirement.StatusCode:
      WHEN "Verified" THEN iVerified = iVerified + 1.
      WHEN "Provided" THEN iUnverified = iUnverified + 1.
      OTHERWISE iMissing = iMissing + 1.
    END CASE.
  END.
  CREATE ttTenderReadiness.
  ASSIGN ttTenderReadiness.TenderId = pcTenderId
         ttTenderReadiness.Score = BusinessRules:TenderReadiness(iMandatory, iVerified)
         ttTenderReadiness.MandatoryCount = iMandatory
         ttTenderReadiness.VerifiedCount = iVerified
         ttTenderReadiness.MissingCount = iMissing
         ttTenderReadiness.UnverifiedCount = iUnverified
         ttTenderReadiness.SubmissionReady = BusinessRules:SubmissionReady(iMandatory, iVerified, iMissing, iUnverified).
END PROCEDURE.

PROCEDURE UpdateTaskStatus:
  DEFINE INPUT PARAMETER pcMode AS CHARACTER NO-UNDO.
  DEFINE INPUT PARAMETER pcTaskId AS CHARACTER NO-UNDO.
  DEFINE INPUT PARAMETER pcUserId AS CHARACTER NO-UNDO.
  DEFINE INPUT PARAMETER pcRequested AS CHARACTER NO-UNDO.
  DEFINE INPUT PARAMETER pcBlocker AS CHARACTER NO-UNDO.
  DEFINE INPUT PARAMETER pcEvidence AS CHARACTER NO-UNDO.
  DEFINE OUTPUT PARAMETER pcResult AS CHARACTER NO-UNDO.
  DEFINE BUFFER bTask FOR IXTask.
  DEFINE BUFFER bUser FOR IXUser.

  BusinessRules:ValidateMode(pcMode).
  FIND bTask EXCLUSIVE-LOCK WHERE bTask.TaskId = pcTaskId AND bTask.ModeCode = pcMode NO-ERROR.
  IF NOT AVAILABLE bTask THEN UNDO, THROW NEW AppError("Task not found in active mode.", 0).
  FIND bUser NO-LOCK WHERE bUser.ActorId = pcUserId AND bUser.Active = TRUE NO-ERROR.
  IF NOT AVAILABLE bUser THEN UNDO, THROW NEW AppError("Active user not found.", 0).
  BusinessRules:ValidateTaskTransition(bTask.StatusCode, pcRequested, bUser.RoleCode, bTask.AssigneeId = pcUserId).
  IF pcRequested = "Blocked" AND TRIM(pcBlocker) = "" THEN
    UNDO, THROW NEW AppError("A blocker description is required.", 0).
  ASSIGN bTask.StatusCode = pcRequested
         bTask.Blocker = pcBlocker
         bTask.EvidenceRef = pcEvidence
         bTask.UpdatedAt = NOW
         bTask.UpdatedBy = pcUserId
         pcResult = "Saved".
END PROCEDURE.

PROCEDURE GetInvoiceBalance:
  DEFINE INPUT PARAMETER pcMode AS CHARACTER NO-UNDO.
  DEFINE INPUT PARAMETER pcInvoiceId AS CHARACTER NO-UNDO.
  DEFINE OUTPUT PARAMETER piBalanceCents AS INT64 NO-UNDO.
  DEFINE VARIABLE iPaid AS INT64 NO-UNDO.
  FIND IXInvoice NO-LOCK WHERE IXInvoice.InvoiceId = pcInvoiceId AND IXInvoice.ModeCode = pcMode NO-ERROR.
  IF NOT AVAILABLE IXInvoice THEN UNDO, THROW NEW AppError("Invoice not found in active mode.", 0).
  FOR EACH IXPayment NO-LOCK WHERE IXPayment.ModeCode = pcMode AND IXPayment.InvoiceId = pcInvoiceId AND IXPayment.StatusCode = "Recorded":
    iPaid = iPaid + IXPayment.AmountCents.
  END.
  piBalanceCents = BusinessRules:InvoiceBalance(IXInvoice.TotalCents, iPaid).
END PROCEDURE.

PROCEDURE GetFundingGap:
  DEFINE INPUT PARAMETER pcMode AS CHARACTER NO-UNDO.
  DEFINE INPUT PARAMETER pcFundingId AS CHARACTER NO-UNDO.
  DEFINE OUTPUT PARAMETER piGapCents AS INT64 NO-UNDO.
  FIND IXFunding NO-LOCK WHERE IXFunding.FundingId = pcFundingId AND IXFunding.ModeCode = pcMode NO-ERROR.
  IF NOT AVAILABLE IXFunding THEN UNDO, THROW NEW AppError("Funding record not found in active mode.", 0).
  piGapCents = BusinessRules:FundingGap(IXFunding.RequiredCents, IXFunding.AvailableCents).
END PROCEDURE.

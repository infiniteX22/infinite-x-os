USING Progress.Lang.*.

CLASS InfiniteX.BusinessRules:
  METHOD PUBLIC STATIC VOID ValidateMode(INPUT pcMode AS CHARACTER):
    IF pcMode <> "DEMO" AND pcMode <> "REAL" THEN
      UNDO, THROW NEW AppError("Mode must be DEMO or REAL.", 0).
  END METHOD.

  METHOD PUBLIC STATIC INTEGER TenderReadiness(INPUT piMandatory AS INTEGER, INPUT piVerified AS INTEGER):
    IF piMandatory <= 0 THEN RETURN 0.
    RETURN INTEGER(ROUND((piVerified / piMandatory) * 100, 0)).
  END METHOD.

  METHOD PUBLIC STATIC LOGICAL SubmissionReady(INPUT piMandatory AS INTEGER, INPUT piVerified AS INTEGER, INPUT piMissing AS INTEGER, INPUT piUnverified AS INTEGER):
    RETURN piMandatory > 0 AND piVerified = piMandatory AND piMissing = 0 AND piUnverified = 0.
  END METHOD.

  METHOD PUBLIC STATIC INT64 InvoiceBalance(INPUT piTotalCents AS INT64, INPUT piRecordedPaymentsCents AS INT64):
    RETURN MAXIMUM(0, piTotalCents - piRecordedPaymentsCents).
  END METHOD.

  METHOD PUBLIC STATIC INT64 FundingGap(INPUT piRequiredCents AS INT64, INPUT piAvailableCents AS INT64):
    IF piRequiredCents < 0 OR piAvailableCents < 0 THEN
      UNDO, THROW NEW AppError("Funding values cannot be negative.", 0).
    RETURN MAXIMUM(0, piRequiredCents - piAvailableCents).
  END METHOD.

  METHOD PUBLIC STATIC VOID ValidateTaskTransition(INPUT pcCurrent AS CHARACTER, INPUT pcRequested AS CHARACTER, INPUT pcRole AS CHARACTER, INPUT plOwnTask AS LOGICAL):
    IF pcRequested = "Verified complete" AND pcCurrent <> "Reported complete" THEN
      UNDO, THROW NEW AppError("Only reported completion can be verified.", 0).
    IF pcRequested = "Verified complete" AND pcRole <> "Director" AND pcRole <> "Project Manager" THEN
      UNDO, THROW NEW AppError("Manager verification is required.", 0).
    IF pcRequested <> "Verified complete" AND NOT plOwnTask AND pcRole <> "Director" AND pcRole <> "Project Manager" THEN
      UNDO, THROW NEW AppError("Permission denied.", 0).
  END METHOD.
END CLASS.

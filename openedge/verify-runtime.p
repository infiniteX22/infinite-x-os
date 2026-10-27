USING InfiniteX.BusinessRules.

DEFINE VARIABLE iMandatory AS INTEGER NO-UNDO.
DEFINE VARIABLE iVerified AS INTEGER NO-UNDO.
DEFINE VARIABLE iMissing AS INTEGER NO-UNDO.
DEFINE VARIABLE iProvided AS INTEGER NO-UNDO.
DEFINE VARIABLE iPaid AS INT64 NO-UNDO.
DEFINE VARIABLE iScore AS INTEGER NO-UNDO.
DEFINE VARIABLE iBalance AS INT64 NO-UNDO.
DEFINE VARIABLE iGap AS INT64 NO-UNDO.

DO TRANSACTION:
  FIND IXUser EXCLUSIVE-LOCK WHERE IXUser.ActorId = "director" NO-ERROR.
  IF NOT AVAILABLE IXUser THEN DO:
    CREATE IXUser.
    ASSIGN IXUser.ActorId = "director" IXUser.DisplayName = "Alex Mokoena" IXUser.RoleCode = "Director" IXUser.Active = TRUE.
  END.
  FIND IXProject EXCLUSIVE-LOCK WHERE IXProject.ProjectId = "oe-clinic" NO-ERROR.
  IF NOT AVAILABLE IXProject THEN DO:
    CREATE IXProject.
    ASSIGN IXProject.ProjectId = "oe-clinic" IXProject.ModeCode = "DEMO"
           IXProject.Name = "Clinic electrical upgrade" IXProject.ClientName = "Riverside Clinic"
           IXProject.OwnerId = "director" IXProject.ProgressPct = 68 IXProject.StatusCode = "At risk"
           IXProject.DueDate = DATE(11,30,2026) IXProject.BudgetCents = 42000000
           IXProject.CostCents = 28700000 IXProject.Blocker = "Drawing approval outstanding"
           IXProject.UpdatedAt = NOW.
  END.
  FIND IXTender EXCLUSIVE-LOCK WHERE IXTender.TenderId = "oe-tdr17" NO-ERROR.
  IF NOT AVAILABLE IXTender THEN DO:
    CREATE IXTender.
    ASSIGN IXTender.TenderId = "oe-tdr17" IXTender.ModeCode = "DEMO"
           IXTender.ReferenceNo = "TDR-2026-017" IXTender.TenderTitle = "Riverside Clinic Electrical Works"
           IXTender.Category = "Electrical" IXTender.CloseDate = DATE(10,28,2026)
           IXTender.SourceUrl = "https://www.etenders.gov.za/" IXTender.LastRefreshed = NOW.
    CREATE IXTenderRequirement.
    ASSIGN IXTenderRequirement.RequirementId = "oe-r1" IXTenderRequirement.ModeCode = "DEMO"
           IXTenderRequirement.TenderId = "oe-tdr17" IXTenderRequirement.LabelText = "Tax compliance PIN"
           IXTenderRequirement.Mandatory = TRUE IXTenderRequirement.StatusCode = "Verified".
    CREATE IXTenderRequirement.
    ASSIGN IXTenderRequirement.RequirementId = "oe-r2" IXTenderRequirement.ModeCode = "DEMO"
           IXTenderRequirement.TenderId = "oe-tdr17" IXTenderRequirement.LabelText = "Briefing attendance"
           IXTenderRequirement.Mandatory = TRUE IXTenderRequirement.StatusCode = "Provided".
    CREATE IXTenderRequirement.
    ASSIGN IXTenderRequirement.RequirementId = "oe-r3" IXTenderRequirement.ModeCode = "DEMO"
           IXTenderRequirement.TenderId = "oe-tdr17" IXTenderRequirement.LabelText = "Safety file"
           IXTenderRequirement.Mandatory = TRUE IXTenderRequirement.StatusCode = "Missing".
  END.
  FIND IXInvoice EXCLUSIVE-LOCK WHERE IXInvoice.InvoiceId = "oe-inv1" NO-ERROR.
  IF NOT AVAILABLE IXInvoice THEN DO:
    CREATE IXInvoice.
    ASSIGN IXInvoice.InvoiceId = "oe-inv1" IXInvoice.ModeCode = "DEMO" IXInvoice.InvoiceNo = "OE-INV-001"
           IXInvoice.ProjectId = "oe-clinic" IXInvoice.TotalCents = 8500000 IXInvoice.DueDate = DATE(9,20,2026).
    CREATE IXPayment.
    ASSIGN IXPayment.PaymentId = "oe-pay1" IXPayment.ModeCode = "DEMO" IXPayment.InvoiceId = "oe-inv1"
           IXPayment.PaymentRef = "OE-DEMO-RECEIPT-001" IXPayment.AmountCents = 1000000 IXPayment.StatusCode = "Recorded".
  END.
  FIND IXFunding EXCLUSIVE-LOCK WHERE IXFunding.FundingId = "oe-fund1" NO-ERROR.
  IF NOT AVAILABLE IXFunding THEN DO:
    CREATE IXFunding.
    ASSIGN IXFunding.FundingId = "oe-fund1" IXFunding.ModeCode = "DEMO" IXFunding.ProjectId = "oe-clinic"
           IXFunding.PurposeText = "Clinic working capital" IXFunding.RequiredCents = 26000000
           IXFunding.AvailableCents = 8000000 IXFunding.StatusCode = "Application in progress".
  END.
END.

FOR EACH IXTenderRequirement NO-LOCK WHERE IXTenderRequirement.ModeCode = "DEMO" AND IXTenderRequirement.TenderId = "oe-tdr17" AND IXTenderRequirement.Mandatory:
  iMandatory = iMandatory + 1.
  CASE IXTenderRequirement.StatusCode:
    WHEN "Verified" THEN iVerified = iVerified + 1.
    WHEN "Provided" THEN iProvided = iProvided + 1.
    OTHERWISE iMissing = iMissing + 1.
  END CASE.
END.
FIND IXInvoice NO-LOCK WHERE IXInvoice.InvoiceId = "oe-inv1".
FOR EACH IXPayment NO-LOCK WHERE IXPayment.ModeCode = "DEMO" AND IXPayment.InvoiceId = IXInvoice.InvoiceId AND IXPayment.StatusCode = "Recorded":
  iPaid = iPaid + IXPayment.AmountCents.
END.
FIND IXFunding NO-LOCK WHERE IXFunding.FundingId = "oe-fund1".
ASSIGN iScore = BusinessRules:TenderReadiness(iMandatory, iVerified)
       iBalance = BusinessRules:InvoiceBalance(IXInvoice.TotalCents, iPaid)
       iGap = BusinessRules:FundingGap(IXFunding.RequiredCents, IXFunding.AvailableCents).
PUT UNFORMATTED
  "OPENEDGE_PROJECT=" IXFunding.ProjectId SKIP
  "TENDER_SCORE=" iScore SKIP
  "SUBMISSION_READY=" BusinessRules:SubmissionReady(iMandatory, iVerified, iMissing, iProvided) SKIP
  "INVOICE_BALANCE_CENTS=" iBalance SKIP
  "FUNDING_GAP_CENTS=" iGap SKIP
  "PERSISTED_AT=" NOW SKIP.
QUIT.

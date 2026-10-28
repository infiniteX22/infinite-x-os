# INFINITE-X OS usage and evaluation

This guide supplements the setup instructions in the [README](../README.md). It describes the fictional demonstration workflow, supported Wayne controls, integration evidence and evaluation limitations.

## Demonstration scenario

The fictional demonstration company performs electrical construction and bids across multiple tender categories. The connected workflow shows how an employee-reported blocker becomes visible to management, persists in OpenEdge, enters Wayne's reviewed session context and supports a follow-up communication.

The submission demo video is intended to be 2–3 minutes. Its link will be added later; this repository does not claim that a video is currently available. A live presentation is planned for 15 minutes plus 5 minutes of questions.

## Short evaluator walkthrough

### 1. Record an operational issue

1. Sign in with fictional employee account `sc`.
2. Open **Team & Tasks**.
3. Open **LV board factory test** under **Warehouse LV installation**.
4. Record a progress update, blocker and evidence reference.

This demonstrates role-aware updates, named employee/task/project relationships, timestamped history and the distinction between reported and verified completion.

### 2. Review the same record as management

1. Sign out and sign in with the fictional `director` account.
2. Open **Dashboard**.
3. Review the latest team update and linked Wayne briefing item.
4. Follow the record link to the underlying task or project.

The dashboard is calculated from operational records rather than a separate presentation dataset.

### 3. Review Wayne's outbound context

1. Select **Meet Wayne**.
2. Choose the sandbox session.
3. Review the outbound disclosure categories and expand **Tasks summary**.
4. Confirm that the named task, project and recorded blocker are present, then accept and connect.
5. Ask: **“What is the latest recorded blocker on the warehouse project?”**
6. Ask: **“Draft an email to the client about that blocker. Include a subject and complete body, but do not send it.”**
7. Review the captured draft and supporting record links.

This demonstrates permission-filtered session-start context, external-processing disclosure, source-linked answers and draft-only email behaviour.

### 4. Review reporting and persistence evidence

1. End the Wayne session and open **Reports**.
2. Review project completion, tracked tenders by status and the period-scoped invoiced/receipts/expenses comparison.
3. Treat those financial categories as recorded activity—not cash balance, recognised revenue or profit.
4. Review the independent OpenEdge export evidence in [VERIFICATION.md](VERIFICATION.md).

## Suggested live presentation structure

| Time | Section | Evidence |
|---|---|---|
| 0:00–2:00 | Problem and users | Fragmented delivery, tender, finance and meeting records; directors, project managers, employees, estimators and finance users |
| 2:00–5:00 | Dashboard and modules | Calculated KPIs, linked records, responsive modules and Demo/Real isolation |
| 5:00–8:00 | Connected employee workflow | Task update → dashboard → source record → role boundary |
| 8:00–11:00 | OpenEdge integration | Local AVM/ABL transactional write, authoritative revision, independent export and SQLite cache hydration |
| 11:00–13:30 | Wayne | Outbound review, LiveAvatar FULL session, transcript, source links and voice navigation |
| 13:30–15:00 | Reports, privacy and limits | Period filters, financial labels, external processing, email preview and production considerations |
| 15:00–20:00 | Questions | Architecture, intended business value, security boundaries and next steps |

## Supported Wayne controls

During an active session that is receiving final user transcripts, explicit commands can navigate to authorised sidebar sections:

- `Open Dashboard`
- `Open CRM`
- `Open Projects and present`
- `Open Team and Tasks and present`
- `Open Quotations and Invoices`
- `Open Tenders and present`
- `Open Funding`
- `Open Finance and present`
- `Open Compliance`
- `Open Documents`
- `Open AI Meetings`
- `Open Reports and present`
- `Open Settings`

Presentation controls include `Present this page`, `Go fullscreen`, `Stop presenting`, `Stop sharing the screen` and `Bring Wayne back`.

These are local application commands, not LiveAvatar tools. Only final **user** transcript events from the active session can execute them. Interim text, Wayne's speech, historical transcripts, ordinary business questions and arbitrary URLs do not trigger navigation. The application's visible `Heard`, `Opening` and success/failure status is authoritative because the provider does not receive the local navigation result.

Reports, Tender Radar, Finance, Team & Tasks and Projects have section-specific privacy-filtered presentation summaries. Other authorised sections use a generic visible-section summary. Navigation alone does not update Wayne's knowledge. Use **Review context and restart Wayne** to inspect and approve refreshed page context for a new provider session; the logical meeting and notes remain available.

## Integration evidence

### OpenEdge

- Browser mutations are handled by `server.mjs` and deterministic rules in `business-core.mjs`.
- `openedge-repository.mjs` serialises the active mode and invokes the local AVM.
- `openedge/sync-repository.p` validates repository metadata and transactionally commits a revisioned snapshot.
- `openedge/export-repository.p` provides token-protected independent reads and restart hydration.
- OpenEdge is authoritative; SQLite is the compatibility cache.
- PAS exposes authenticated health and repository-read routes through `InfiniteX.RepositoryHandler`. It is not the browser-write path.
- Typed schema and `InfiniteX/BusinessRules.cls` are present, while the demonstrated persistence path uses generic `IXRepositoryRecord` revisions.

### Runtime AI

- `avatarBriefing` builds allowlisted, role- and mode-filtered summaries.
- `liveavatar-provider.mjs` starts a LiveAvatar FULL voice-agent session and supplies the declared dynamic variables.
- Context is supplied at session start; question-driven RAG, MCP tool calling and live mid-session record retrieval are not claimed.
- Current business facts and transcript-derived meeting history remain separate.
- Final provider transcript events are persisted before provider-event deletion is requested.
- The optional OpenAI text route is separate and is not required by Wayne.

## Privacy and operational limits

- The provider receives the summaries shown in the outbound review and speech captured after microphone permission is granted.
- Summaries exclude contact details, banking information, credentials, exact addresses, document bodies and confidential contract terms. Microphone speech cannot be pre-redacted.
- LiveAvatar sessions are blocked in Real Mode in this implementation.
- Provider deletion acknowledgement is not proof that backups or every downstream copy were erased.
- Email defaults to preview/outbox. A generated email remains a draft unless a separately configured SMTP adapter confirms delivery after explicit review.
- A clean checkout requires separately installed and licensed OpenEdge 12.8 software plus manual PAS instance provisioning.
- Evaluators need their own LiveAvatar API key and business voice agent until a hosted demo is available.
- Sandbox duration, credits, recognition quality and media connectivity are provider-dependent.
- Mid-session business-context refresh is unavailable; context review and restart are explicit.
- Browser print/save-to-PDF is supported; server-generated quotation/invoice PDFs are not implemented.
- Authentication and local file storage are suitable for evaluation, not production deployment.

If LiveAvatar is unavailable, demonstrate the operational path through **Team & Tasks**, **Dashboard**, **Business records**, the OpenEdge export evidence and **Reports**. Show provider errors honestly rather than substituting scripted responses.

## Evaluation criteria mapping

| Criterion | Weight | Repository evidence |
|---|---:|---|
| Technical complexity | 20% | Authoritative OpenEdge repository, transactional ABL revision service, cache hydration, role/mode isolation, deterministic rules and LiveAvatar media/transcript lifecycle |
| Business impact | 25% | Connected accountability, tender readiness, receivables/funding visibility and meeting follow-through; benefits are intended rather than measured |
| Completeness | 15% | Sidebar modules, dashboard links, create/edit workflows, reports, meeting history and Demo/Real separation, with limitations documented |
| Production readiness | 15% | Permission checks, fail-closed OpenEdge writes, duplicate prevention, privacy review and retention controls, alongside explicit authentication/storage/PAS deployment gaps |
| Innovation | 10% | Operations assistant grounded in reviewed active-mode summaries, source links, transcript continuity and local voice-controlled presentation |
| Presentation & demo | 15% | Connected 2–3 minute workflow, 15-minute live structure, visible integration evidence and an honest provider fallback |

This mapping identifies available evidence. It does not assert a score, measured business benefits or completion of unverified behaviour.

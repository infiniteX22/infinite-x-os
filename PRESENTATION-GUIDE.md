# INFINITE-X OS evaluator guide

## Product and demonstration scenario

INFINITE-X OS is an AI-powered project management workspace for organisations that need a connected view of delivery, people, commercial records and management follow-through.

The fictional demonstration company performs electrical construction and bids across multiple tender categories. The scenario shows how an employee-reported blocker can become visible to management, persist in OpenEdge, enter Wayne’s authorised briefing and support a follow-up communication.

## Submission demo video: 2–3 minutes

The submission video is a concise recorded walkthrough. Its link will be added later; this guide does not claim that it already exists.

### 0:00–0:35 — record an operational issue

1. Sign in with the fictional employee account `sc`.
2. Open **Team & Tasks**.
3. Open **LV board factory test** under **Warehouse LV installation**.
4. Record a progress update, blocker and evidence reference.

Evidence shown: role-aware update permission, named employee/task/project, timestamped history and the distinction between reported and verified completion.

### 0:35–1:05 — management sees the same record

1. Sign out and use the fictional `director` account.
2. Open **Dashboard**.
3. Show the latest team update and the linked Wayne briefing item.
4. Follow the record link to the underlying task or project.

Evidence shown: the dashboard is calculated from operational records rather than a separate presentation dataset.

### 1:05–2:20 — review Wayne’s authorised context

1. Open **Meet Wayne**.
2. Choose the sandbox session.
3. Review the outbound categories and expand **Tasks summary**.
4. Confirm that the named task, project and recorded blocker are present, then accept and connect.
5. Ask: **“What is the latest recorded blocker on the warehouse project?”**
6. Ask: **“Draft an email to the client about that blocker. Include a subject and complete body, but do not send it.”**
7. Show the captured draft and supporting record links.

Evidence shown: permission-filtered session-start grounding, external-processing disclosure, concise source-linked responses and draft-only email behaviour.

### 2:20–3:00 — show persistence and reporting

1. End the Wayne session and open **Reports**.
2. Show project completion, tracked tenders by status and the invoiced/receipts/expenses comparison.
3. State that those finance categories are records—not cash balance, recognised revenue or profit.
4. Reference the independent OpenEdge export evidence in [docs/VERIFICATION.md](docs/VERIFICATION.md).

## Live presentation: 15 minutes plus 5 minutes Q&A

| Time | Section | Evidence |
|---|---|---|
| 0:00–2:00 | Problem and users | Fragmented delivery, tender, finance and meeting records; directors, project managers, employees, estimators and finance users |
| 2:00–5:00 | Dashboard and modules | Calculated KPIs, linked records, responsive operational modules and Demo/Real isolation |
| 5:00–8:00 | Connected employee workflow | Task update → dashboard → source record → role boundary |
| 8:00–11:00 | OpenEdge integration | Local AVM/ABL transactional write, authoritative revision, independent export and SQLite cache hydration |
| 11:00–13:30 | Wayne | Outbound review, LiveAvatar FULL session, transcript, source links and voice navigation |
| 13:30–15:00 | Reports, privacy and limits | Period filters, financial labels, external processing, email preview and production considerations |
| 15:00–20:00 | Q&A | Architecture, business value, security boundaries and next steps |

## Supported Wayne controls

While an active session is receiving final user transcripts, explicit commands can navigate to authorised sidebar sections:

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

Other controls include `Present this page`, `Go fullscreen`, `Stop presenting`, `Stop sharing the screen` and `Bring Wayne back`.

These are local application commands, not LiveAvatar tools. Only final **user** transcript events from the active session can execute them. Interim text, Wayne’s speech, historical transcripts, ordinary business questions and arbitrary URLs do not trigger navigation. The visible `Heard`, `Opening` and success/failure status is authoritative because the provider does not receive the local navigation result.

Reports, Tender Radar, Finance, Team & Tasks and Projects have section-specific privacy-filtered presentation summaries. Other authorised sections use a generic visible-section summary. Navigation alone does not update Wayne’s knowledge. Use **Review context and restart Wayne** to inspect and approve refreshed page context for a new provider session; the logical meeting and notes remain available.

## Integration evidence

### OpenEdge

- Browser mutations are handled by `server.mjs` and deterministic rules in `business-core.mjs`.
- `openedge-repository.mjs` serialises the active mode and invokes the local AVM.
- `openedge/sync-repository.p` validates repository metadata and commits a revisioned snapshot transactionally.
- `openedge/export-repository.p` provides token-protected independent reads and restart hydration.
- OpenEdge is authoritative; SQLite is the compatibility cache.
- PAS exposes authenticated health and repository-read routes through `InfiniteX.RepositoryHandler`. It is not the browser-write path.
- Typed schema and `InfiniteX/BusinessRules.cls` are present, but the demonstrated persistence path uses generic `IXRepositoryRecord` revisions.

### Runtime AI

- `avatarBriefing` builds allowlisted role- and mode-filtered summaries.
- `liveavatar-provider.mjs` starts a LiveAvatar FULL voice-agent session and supplies the declared dynamic variables.
- Context is supplied at session start; no question-driven RAG, MCP tool calling or live mid-session record retrieval is claimed.
- Current business facts and transcript-derived meeting history are kept separate.
- Final provider transcript events are persisted before provider-event deletion is requested.
- The optional OpenAI text route is separate and is not required by Wayne.

## Privacy and security answers

**What is sent externally?** The summaries visible in the outbound review and speech captured after microphone permission is granted.

**What is removed from summaries?** Contact details, banking information, credentials, exact addresses, document bodies and confidential contract terms. Microphone speech cannot be pre-redacted.

**Does the provider receive Real Mode records?** No. LiveAvatar sessions are blocked in Real Mode in this implementation.

**Is provider deletion guaranteed?** No. The application saves authorised continuity first and requests provider-event deletion with bounded retries. A provider acknowledgement is not proof that backups or all downstream copies were erased.

**Does Wayne send email?** The default submission environment is preview/outbox only. A generated email remains a draft unless a separately configured SMTP adapter confirms delivery after explicit review.

## Current limitations and evaluator fallback

- A clean checkout requires a separately installed/licensed OpenEdge 12.8 environment and manual PAS instance provisioning.
- Evaluators need their own LiveAvatar API key and business voice agent until a hosted demo is available.
- Sandbox duration, credits, recognition quality and media connectivity are provider-dependent.
- Mid-session business-context refresh is not available; the review-and-restart flow is explicit.
- Browser print/save-to-PDF is supported; server-generated quotation/invoice PDFs are not implemented.
- Local authentication and file storage are evaluation-grade, not production-ready.

If LiveAvatar is unavailable, the operational workflow remains demonstrable through **Team & Tasks**, **Dashboard**, **Business records**, OpenEdge export evidence and **Reports**. Show the provider error honestly; do not substitute a scripted response.

## Judging criteria mapping

| Criterion | Weight | Repository evidence |
|---|---:|---|
| Technical complexity | 20% | Authoritative OpenEdge repository, transactional ABL revision service, cache hydration, role/mode isolation, deterministic business rules, LiveAvatar media/transcript lifecycle |
| Business impact | 25% | Connected accountability, tender readiness, receivables/funding visibility and meeting follow-through; benefits are intended rather than measured |
| Completeness | 15% | Working sidebar modules, dashboard links, create/edit workflows, reports, meeting history and Demo/Real separation; limitations are documented |
| Production readiness | 15% | Permission checks, fail-closed OpenEdge writes, duplicate prevention, privacy review and retention controls, alongside explicit authentication/storage/PAS deployment gaps |
| Innovation | 10% | Operations assistant grounded in reviewed active-mode summaries, source links, transcript continuity and local voice-controlled presentation |
| Presentation & demo | 15% | Connected 2–3 minute workflow, 15-minute live structure, visible integration evidence and honest provider fallback |

The table maps the organiser’s criteria to available evidence. It does not assert a score or convert unverified behaviour into a completed requirement.

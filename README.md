# INFINITE-X OS

INFINITE-X OS is a focused operations platform for an electrical-construction and multi-tendering business. This independent clone turns employee updates, project blockers, tender requirements, receivables, funding needs and meeting commitments into one evidence-linked operating view.

## Launch

Requirements: Node.js 22.5+ and the installed OpenEdge 12.8 runtime. The launcher starts the local OpenEdge broker and PAS instance before the web service.

```powershell
cd "C:\IDriveLocal\infinitexsolutions@outlook.com\Cloud-Drive_infinitexsolutions@outlook.com\Infinite-X Group\Infinite-X Clone"
.\scripts\start-services.ps1
npm start
```

Open **http://127.0.0.1:4319**. You can also double-click `Start INFINITE-X OS.cmd`.

Demo password for every fictional account: `Demo!2026`

| Account ID | Name | Role |
|---|---|---|
| `director` | Alex Mokoena | Director |
| `tm` | Thandi Maseko | Project Manager |
| `sc` | Sipho Cele | Electrician |
| `lr` | Lerato Radebe | Electrician |
| `mr` | Mpho Radebe | Finance |
| `kd` | Kagiso Dube | Estimator |

## What is implemented

- Approved dark-navy/lime dashboard structure with the requested navigation, six KPI cards, Wayne briefing, next review, projects, funding, team updates and tender readiness.
- Responsive layout with no intentional horizontal page overflow; dense tables scroll within their own view on narrow screens.
- Server-enforced Demo/Real mode isolation. Demo Mode is seeded coherently; Real Mode starts with zero operational records.
- Electrical projects, tasks, dependencies, blockers, evidence, employee updates and a separate `Reported complete` → manager `Verified complete` transition.
- All-category Tender Radar backed by the National Treasury eTenders OCDS feed in both Demo and Real modes. Public metadata is refreshed independently into each mode; company tracking state, requirements and documents remain mode-isolated. The connector uses the required publication-date window, preserves official document links and reports source failures honestly.
- Explainable tender relevance scores derived from the recorded title, description and category against the electrical-construction service profile. Relevance is a prioritisation aid—not eligibility or submission readiness.
- Deterministic tender readiness. Only **verified mandatory** requirements contribute; missing or merely provided items prevent submission-ready status.
- A configurable South African compliance baseline spanning CIPC, tax, employment, tendering, construction, electrical work, health and safety, information governance, insurance, skills, operations and recordkeeping. Conditional items stay in `Review applicability` until assessed; the register is not presented as legal advice.
- Itemised quotation authoring adapted from the original OS workflow: client/project links, issue/validity dates, line quantities, unit prices, discounts, adjustable tax, deposit, payment milestones, notes, live preview, revision tracking, print/save-PDF and invoice conversion. Totals are recalculated server-side.
- Invoices, duplicate-protected payment references, recorded receipts, expenses, receivables and project financial fields.
- PO/project/invoice/general funding shape, explicit required costs and confirmed funds, deterministic funding gaps, and document readiness. No offers or approvals are invented.
- Persistent meetings, prepared agendas, reminder/agenda jobs, cancellation history, bounded retries, stable dedupe keys, honest preview/SMTP status, confirmed minutes and approved follow-up actions.
- Wayne LiveAvatar meeting room with direct consent-and-start quick launch, optional Follow-up/history selection, permission-filtered active-mode context, locally persisted transcript events, transcript-only recaps and source-linked business records. No OpenAI API key is required for the selected LiveAvatar route.
- Preferred name and pronunciation guidance under Settings → My Profile.
- Operational sidebar modules rather than route placeholders: client CRUD/archive, project/milestone/task workflows, employee-account controls, itemised quotation numbering/tax/conversion, payments and expenses, live tender discovery/import/checklists, funding checklists, compliance applicability/evidence/expiry, binary document upload/revision/preview/download/archive, meeting follow-through, CSV reports and company settings.
- Reports includes responsive project-completion bars, a tracked-tender status donut and an invoiced/receipts/expenses comparison. All charts use authorised active-mode records, follow the selected reporting period and retain detailed tables and filtered CSV exports.
- Client-side module search/status/category filters, responsive action toolbars, contained wide tables and internally scrolling dialogs.

## Architecture

```text
Browser SPA (index.html, app.js, styles.css)
        │ authenticated JSON, active mode held server-side
Node service (server.mjs)
        ├─ OpenEdge repository adapter (authoritative, fail-closed writes)
        ├─ SQLite compatibility cache hydrated from OpenEdge on restart
        ├─ deterministic rules: business-core.mjs
        ├─ Wayne: OpenAI Responses API when configured
        ├─ tender connector: National Treasury OCDS
        ├─ LiveAvatar FULL sandbox adapter and transcript capture
        └─ persistent scheduler + preview/SMTP adapter

OpenEdge 12.8 + PAS for OpenEdge (verified on this machine)
        ├─ data/openedge/ixosoe database
        ├─ typed core tables plus generic related repository records
        ├─ ABL validation, permissions and deterministic calculations
        ├─ transactional ABL import/export with revision evidence
        └─ authenticated WEB transport at http://127.0.0.1:4326/web/infinitex
```

The source application was inspected for its local Node/SQLite architecture, authenticated service boundary, task scheduling, tender connector and financial patterns. No source database, uploads, documents, credentials, conversation history, generated outputs or customer data were copied. Unrelated division workflows were deliberately not carried into this focused clone.

## OpenEdge repository and rollback

OpenEdge Release 12.8 is installed at `C:\Progress\OpenEdge`. The authoritative database is `data/openedge/ixosoe`; the database broker listens only on `127.0.0.1:4335`. PAS listens on `127.0.0.1:4326` and publishes an authenticated ABL WebHandler. Its token is generated into ignored local storage and is never sent to the browser.

Every successful browser mutation snapshots the active mode through `sync-repository.r`. ABL validates mode, entity type, role/operation permission and payload bounds, then replaces the mode snapshot transactionally and records its revision/actor. If OpenEdge rejects a write, the HTTP request fails and SQLite is restored from OpenEdge. On restart, the compatibility cache is hydrated from OpenEdge rather than treated as authoritative. Document bytes remain under mode-scoped `data/documents/`; OpenEdge stores their authorised metadata and relationships.

Local runtime databases and recovery snapshots are intentionally excluded from the submission. To roll back an installed workspace, stop Node/PAS/the broker, restore the separately retained local snapshot and restart. No automatic dual-write fallback exists. Legacy provider-session history can be imported repeatably from an explicitly supplied recovery copy before restart:

```powershell
node .\scripts\migrate-legacy-wayne-history.mjs "C:\path\to\recovery-copy.sqlite"
```

The importer closes stale `Active` rows, preserves captured provider transcripts and syncs them to OpenEdge. On the next start, the server creates logical meetings and deduplicated transcript events, derives recaps only from recorded speech, and synchronises those records back to OpenEdge.

On a clean checkout with OpenEdge installed at `C:\Progress\OpenEdge`, recreate and verify the sidecar with:

```powershell
powershell -ExecutionPolicy Bypass -File .\openedge\verify-openedge.ps1
```

## Wayne and email

The LiveAvatar FULL sandbox path, LiveKit video/audio, provider events, transcript retrieval, preferred-name greeting, 60-second expiry and cleanup are implemented. A logical meeting can contain several provider sessions, so Restart Wayne preserves the same meeting and deduplicates repeated provider events. Optional Follow-up selection uses the chosen recorded meeting's recap; an ordinary quick launch creates a fresh logical meeting only after consent. Current business snapshots remain separate from discussion history, and absent transcripts produce an explicit unavailable state instead of an invented recap.

Logical meetings, provider sessions, transcript events, recap revisions, transcript-completeness state, confirmed decisions and approved actions are stored through the OpenEdge repository. History is scoped by authenticated owner, company and Demo/Real mode. Mid-session context injection/tool retrieval is not claimed: history selected in the room is supplied to the next explicitly started LiveAvatar session. The saved LiveAvatar agent remains the business agent configured by `LIVEAVATAR_API_KEY` and `LIVEAVATAR_VOICE_AGENT_ID`; no paid OpenAI fallback is required.

`EMAIL_MODE=preview` is the safe default. Wayne recognises an explicit request to email recorded meeting minutes, builds the message only from the authorised meeting transcript/recap, and opens an in-room review requiring confirmation before the fixed allowlisted recipient `infinitexsolutions@outlook.com` can be contacted. Duplicate sends of the same transcript revision are rejected. The SMTP adapter supports STARTTLS or TLS and provider-confirmed `Sent` state, but this environment has no authorised SMTP account; until `SMTP_HOST` and `SMTP_FROM` (plus `SMTP_PASSWORD` when `SMTP_USER` is set) are configured server-side, the attempted delivery remains honestly labelled `Awaiting configuration` in the outbox.

## Security and isolation

- Records, requirements, conversations, meetings, jobs and outbox rows are mode-scoped.
- The server rejects a requested mode that differs from the authenticated session mode.
- Record-changing endpoints re-check roles and active mode; hiding UI buttons is not treated as permission enforcement.
- Payment references and notification dedupe keys are unique.
- Uploaded file bytes are stored in mode-scoped file storage (1 MB local limit); authorised metadata and relationships are stored in OpenEdge. Files are revisioned by title and served only through authenticated active-mode endpoints.
- This local demonstration build uses SHA-256 password hashing for fictional accounts; production deployment requires Argon2id/bcrypt and a production session store.

See [PRESENTATION-GUIDE.md](PRESENTATION-GUIDE.md) for the three-minute connected walkthrough and [docs/VERIFICATION.md](docs/VERIFICATION.md) for detailed evidence, limitations and rerun commands.

## Focused verification commands

With the server running:

```powershell
npm run verify
npm run verify:api:isolated
powershell -ExecutionPolicy Bypass -File .\openedge\verify-openedge.ps1
node .\scripts\verify-presentation-openedge-read.mjs
```

`verify:api:isolated` launches a temporary server on port 4329 with a temporary `IX_DATA_DIR`, runs the full API workflow suite, stops the server, and removes its fixture database. It never writes verification records into the user's Demo or Real workspace. The underlying suite covers create/edit/save, task evidence, quotation conversion, payment duplicate boundaries, tender and funding checklists, compliance, documents, meeting actions, reschedule/cancel, CSV exports, permissions and Demo/Real isolation.

The submission pass on 27 October 2026 additionally verified the three Reports charts at 1440×900 and 390×844, an employee task update through the browser form, an independent ABL export of that exact update, Director dashboard/Wayne payload agreement, employee/mode isolation, full service restart persistence, and one real LiveAvatar sandbox connection through natural expiry. The microphone and camera check used Chrome's synthetic media devices; it confirms media wiring and cleanup, not physical spoken recall. Email remains preview/outbox only.

The 2026-10 interface-quality repair restored the original OS's dense register, SVG-icon, toolbar, responsive drawer, and detail-view patterns without replacing the clone's service-backed workflows. See [docs/UI-QUALITY-REPAIR.md](docs/UI-QUALITY-REPAIR.md) for the comparison, cleanup scope, responsive checks, and known integration blockers.

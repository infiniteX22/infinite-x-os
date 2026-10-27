# Submission verification — 27 October 2026 (Africa/Johannesburg)

This report separates checks run during the submission pass from older project evidence. It does not claim production readiness, delivered email or physical spoken recall.

## Current submission-pass evidence

### Service health

- Application: `http://127.0.0.1:4319` returned HTTP 200.
- PAS for OpenEdge: port `4326` listened; authenticated `GET /web/infinitex/health` returned `ok: true`, repository `OpenEdge`, and current Demo/Real revisions. An unauthenticated request correctly returned 401.
- OpenEdge database broker: port `4335` listened.
- The launcher blocker was fixed in `scripts/start-services.ps1`: the broker executable is launched directly because the batch wrapper inherited the non-interactive parent lifetime and terminated before opening the port.

### Automated checks

- `npm run verify`: syntax checks passed and deterministic business tests passed **6/6**.
- `scripts/verify-reports.mjs`: passed at 1440×900 and 390×844. It compared rendered charts with authorised API records, found no page-level mobile overflow, and confirmed an employee receives HTTP 403 for the finance CSV.
- Report values verified against Demo records:
  - Projects: six named project bars with stored progress values.
  - Tenders: `Discovered: 100`; the donut intentionally has one segment because that is the current stored status distribution.
  - Total invoiced: 25,500,000 cents (R255,000).
  - Recorded receipts: 1,000,000 cents (R10,000).
  - Recorded expenses: 20,700,000 cents (R207,000).
- Desktop and mobile screenshots were visually inspected. The desktop preserves the full-width register layout; the 390 px viewport stacks charts and controls without body overflow. Full-page mobile screenshots can capture the transformed off-canvas fixed drawer; the viewport screenshot and computed transform confirmed the drawer was closed.

### Connected demonstration

The clearly identified fictional task was **LV board factory test** on **Warehouse LV installation**, assigned to **Sipho Cele**.

1. Before the demonstration update it was `In progress`, with blocker `Test witness outstanding` and no evidence reference.
2. The Team & Tasks browser form saved a `Blocked` update at 55% with blocker `Presentation demonstration: supplier witness confirmation pending` and evidence `Demo witness request DEMO-2026-10-27`.
3. Director state returned the same authored update and the dashboard data included it.
4. Wayne preflight included the exact blocker, task and project in `tasks_summary`; `business_summary` identified Alex Mokoena as Director and Wayne as the operations assistant; finance context labelled invoiced amounts, recorded receipts, recorded expenses and outstanding receivables separately and stated that cash/bank balance is unavailable.
5. `scripts/verify-presentation-openedge-read.mjs` independently ran `openedge/export-repository.r`. It returned `OPENEDGE_EXPORT_OK=DEMO|1373`, record `update-mvqtlspk-210613`, the same task/project/author/status/evidence and the current OpenEdge revision.
6. Node, PAS and the broker were stopped cleanly and restarted. The same update remained available from the application and OpenEdge; runtime status reported `OpenEdge authoritative repository; SQLite compatibility cache` and `openedgeVerified: true`.
7. An employee update against an unassigned task returned HTTP 403. The Demo marker did not appear after the same authenticated session switched to Real Mode.

### Wayne

- Payload-only checks passed without creating a provider session: exact project/update, Director identity, financial labels and Demo/Real isolation.
- One real FULL sandbox session was started after outbound-context consent. Observed browser state:
  - `Connecting…` before activation.
  - `Session active` with one live Wayne video track and one audio track.
  - Countdown `00:57`, labelled `Local 60-second estimate` because provider expiry was not returned.
  - Synthetic local camera track active and local-only; microphone control changed to `Microphone on`.
  - Fullscreen and side-panel collapse worked.
  - At natural expiry the room showed `Session ended`, countdown `00:00`, local camera stream absent and zero live Wayne tracks.
- Chrome fake media devices were used, so this proves media/session wiring and cleanup, not a physical spoken question or audible human assessment. No Presentation session or paid credit was used.
- Context is supplied at session start. Live mid-session record retrieval is not claimed; explicit restart refreshes summaries and requires its normal consent/credit path.

## Architecture evidence

- Browser mutation: `POST /api/tasks/{taskId}/update` in `server.mjs`.
- Deterministic validation: `taskStatusUpdate` in `business-core.mjs`.
- Repository adapter: `openedge-repository.mjs` serialises active-mode entities and fails closed on rejected OpenEdge writes.
- ABL write boundary: `openedge/sync-repository.p` / compiled local `.r`; validates mode, entity, permission metadata and payload bounds, then commits a revisioned snapshot.
- Independent ABL read: `openedge/export-repository.p` / local compiled `.r`.
- PAS transport: `openedge/InfiniteX/RepositoryHandler.cls` mapped by `openedge/infinitex.handlers`.
- SQLite role: local compatibility cache hydrated from OpenEdge on startup and restored from OpenEdge after a rejected write. It is not the claimed authoritative repository.

## Reports definitions

- **Project completion:** stored `progress` for projects whose `updated_at` matches the selected period.
- **Tracked tenders by status:** current stored status for tenders whose `published_date` or `last_refreshed` matches the selected period.
- **Financial activity:** invoice totals selected by due date, Recorded-status payments by `recorded_at`, and expenses by `incurred_at`. These are not labelled as cash balance, recognised revenue or profit.
- Period choices: all recorded data, last 30 days, last 90 days and current calendar year. Empty periods show an explanation rather than fabricated zero values.
- CSV exports receive the same period and remain authenticated; finance export is permission-restricted.

## Current limitations

- SMTP is intentionally unconfigured. Email remains preview/outbox; no delivery was attempted or claimed.
- Browser print/save-to-PDF is supported; server-generated quotation/invoice PDFs are not implemented.
- Demo passwords use local SHA-256 hashing and sessions are in memory. Production deployment requires Argon2id/bcrypt, a production session store and a security review.
- LiveAvatar availability, sandbox limits, network/media permission and provider behaviour remain external dependencies.
- The provider receives only the reviewed allowlisted summaries, but microphone speech is processed externally and cannot be pre-redacted.
- Provider deletion acknowledgement does not prove removal from provider backups or every downstream copy.
- The installed OpenEdge Dev Studio entitlement is suitable for this local demonstration and is not represented as a production remote-database licence.

## Previous evidence retained

Earlier focused verification covered CRUD/module workflows, tender/funding readiness calculations, meeting reschedule/cancel and notification dedupe, transcript/recap isolation, responsive route checks and the original-to-clone UI comparison. Those results remain useful background but are not presented as newly rerun during this submission pass.

The original Infinite-X OS and PathBridge were not modified.

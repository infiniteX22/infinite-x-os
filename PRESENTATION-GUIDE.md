# INFINITE-X OS presentation guide

## Three-minute walkthrough

Use **Demo Mode** and keep the browser at 100% zoom. The fictional account password is documented in the README; do not display a real credential during the presentation.

### 0:00–0:40 — an employee reports the problem

1. Sign in as **Sipho Cele — Electrician**.
2. Open **Team & Tasks** from the sidebar.
3. Find **LV board factory test** under **Warehouse LV installation**, select **Update**, and show the recorded fictional blocker: “Presentation demonstration: supplier witness confirmation pending,” with evidence reference **Demo witness request DEMO-2026-10-27**.
4. If you need to demonstrate another save, adjust only the progress/evidence wording and select **Record update**. Point out the author, time, named task/project and evidence in **Update history**. Do not repeat the prepared update merely to prove persistence.

What this proves: the role boundary allows an employee to report their assigned work, while verified completion remains a separate manager-controlled state.

### 0:40–1:10 — the dashboard reflects the same record

1. Sign out and sign in as **Alex Mokoena — Director**.
2. Open **Dashboard**.
3. Show **Latest team updates** and Wayne’s briefing. Follow **View project** or **View records** to show that the summary links back to operational records rather than a scripted slide.

Say: “One employee update becomes visible to management without re-keying the issue.”

### 1:10–2:25 — Wayne receives the authorised snapshot

1. Select **Meet Wayne** in the sidebar or **Talk to Wayne** on the dashboard.
2. Leave **Sandbox — approximately 60 seconds** selected. Do not use Presentation mode during rehearsal unless you deliberately accept its credit confirmation.
3. Review the outbound context. Expand **Tasks summary** and confirm that it contains the latest named employee update and **Warehouse LV installation**. Show the privacy notice: selected summaries and microphone speech are processed externally.
4. Accept and connect. The timer starts only after the provider session becomes active.
5. Ask: **“What is the latest recorded blocker on the warehouse project?”**
6. Then ask: **“Draft an email to the client about that recorded blocker. Include a subject and complete body, but do not send it.”**
7. Show the captured draft and **Copy** control in the room. Do not claim the email was sent.

Wayne should identify Alex as the Director and himself as the operations assistant. If asked “How much do we have?”, he should distinguish total invoiced, recorded receipts, recorded expenses and outstanding receivables, and say that bank/cash balance is unavailable because none is recorded.

### 2:25–3:00 — close the operational loop

1. Open **Business records** in the room and follow the named source back to the task or project.
2. End the meeting. Explain that transcript continuity is saved locally/OpenEdge before provider-event deletion is requested.
3. Open **Reports** and show the named project-progress bars, the tender-status donut and the financial comparison. State that R255,000 invoiced, R10,000 recorded receipts and R207,000 recorded expenses are separate record categories—not cash balance or profit.

## Business problem and use case

Electrical-construction work produces dependencies, site evidence, approvals, invoices and funding needs across multiple people. Tendering adds deadlines and mandatory-document checks across all categories. INFINITE-X OS joins those records so a reported blocker can be traced from the employee update to management visibility, an authorised AI briefing, a meeting and an approved follow-up action.

## Verified integration points

### OpenEdge

- Browser task update: `POST /api/tasks/{taskId}/update` in `server.mjs`.
- Deterministic transition rule: `taskStatusUpdate` in `business-core.mjs`.
- Live repository adapter: `openedge-repository.mjs` serialises active-mode entities including `tasks` and `task_updates`.
- ABL write boundary: `openedge/sync-repository.r` (source: `sync-repository.p`) validates the mode, entity, role/operation and payload bounds, then commits a revisioned mode snapshot transactionally.
- Independent ABL read: `openedge/export-repository.r` returns the stored revision and authorised entity rows using the server-only token.
- Restart hydration: the SQLite compatibility cache is replaced from that OpenEdge export. A rejected OpenEdge write returns an error and restores the cache; there is no silent operational fallback.
- PAS read transport: `openedge/InfiniteX/RepositoryHandler.cls`, mapped by `openedge/infinitex.handlers`. The browser mutation path itself uses the local AVM adapter, not PAS; do not describe it as a PAS write.

The current live repository stores operational rows as named `IXRepositoryRecord` entities with relationship fields and encoded JSON payloads. Typed OpenEdge schema and `InfiniteX/BusinessRules.cls` are present, but the demonstrated browser repository path is the revisioned snapshot service above.

### Runtime AI

- The server builds an allowlisted, role- and mode-filtered snapshot in `avatarBriefing`.
- `liveavatar-provider.mjs` creates the existing LiveAvatar voice-agent session and supplies the named values through `voice_agent.dynamic_variables`.
- The browser uses the provider’s Web SDK/LiveKit media session. No paid OpenAI fallback is required for this path.
- Current business facts and recorded meeting discussion are separate variables. The latest task update is included in `tasks_summary`; historical discussion comes only from captured transcript/recap records.
- Email drafting is a suggestion captured from Wayne’s response. The application does not send it or mark it delivered. Meeting-minutes email also remains in preview/outbox because SMTP is not configured.

## Short privacy answers

**What leaves the application?** Only the outbound summaries shown in the review panel, plus speech captured after microphone permission is granted.

**What is excluded?** The server-side allowlist removes contact details, banking data, credentials, exact addresses, document bodies and confidential contract terms. Real Mode remains blocked from LiveAvatar sessions.

**Can microphone speech be redacted first?** No. It is processed externally as spoken; the review panel states this explicitly.

**Is deletion guaranteed?** No. INFINITE-X OS persists authorised continuity first and then requests provider-event deletion with bounded retries. Provider acknowledgement is not proof that backups or every downstream copy were erased.

**Are secrets in the browser?** No. LiveAvatar credentials stay in server-side `.env`; the browser receives only the short-lived connection data required by the provider SDK.

## Current limitations and honest fallback

- The live spoken result depends on LiveAvatar availability, account limits, microphone permission and network/media connectivity. The sandbox session is short and must not be restarted automatically.
- Context is supplied at session start. Mid-session retrieval is not claimed; select history or explicitly restart to refresh it.
- Audio quality and the exact phrasing of a generated email are provider behaviours. The application captures a draft only when the response contains a subject and body.
- Provider-event deletion cannot prove deletion from provider backups. SMTP remains preview-only unless an authorised no-cost account is configured and explicitly tested.
- The installed OpenEdge licence is suitable for the local demonstration. It is not presented as a production remote-database entitlement.

If Wayne fails, keep the room open and show the readable provider error, outbound review and **Business records**. Then demonstrate the same named update in **Team & Tasks** and **Dashboard**, and explain that the deterministic operational/OpenEdge path remains available while the external avatar service is unavailable. Do not substitute a scripted answer or claim a live AI response.

## Submission checklist

- [x] `README.md` launches the clone at `http://127.0.0.1:4319` and distinguishes verified behaviour from configuration-dependent services.
- [x] `.env.example` lists environment-variable names only; `.env`, service tokens, databases, uploads and transcripts are ignored.
- [x] OpenEdge broker/PAS and Node service start with `scripts/start-services.ps1` and `npm start` (or `Start INFINITE-X OS.cmd`).
- [x] Demo evidence includes the named employee update, dashboard reflection, independent OpenEdge export evidence and outbound Wayne review.
- [x] Reports charts were value-checked and visually inspected at 1440×900 and 390×844.
- [x] No Presentation-mode session or paid credit was consumed during automated verification.
- [x] Demo/Real isolation was checked and Real Mode was not populated with the demonstration update.
- [x] The original Infinite-X OS and PathBridge remained untouched.
- [ ] Manually ask Wayne the suggested warehouse-project question with a physical microphone and assess the spoken answer; the automated check used synthetic browser media.
- [ ] Manually request the email draft and show it without sending. SMTP remains intentionally unconfigured.

## Scope of challenge mapping

This guide maps only to the requirements and integration claims already documented in this repository: meaningful OpenEdge persistence/ABL rules, connected operational records, runtime AI grounding, Demo/Real isolation and an honest demonstration. No separate official judging rubric was found in the project, so no additional scoring criteria are inferred.

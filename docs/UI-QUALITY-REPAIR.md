# Interface quality repair — 24 October 2026

## Cause and original-component comparison

The clone had retained the original navy/lime tokens, fixed application shell, login composition, search, mode separation, and service-backed dialogs. Several operational modules had nevertheless been simplified into repeated three-column card grids. Those replacements imposed a 1400 px content cap, exposed raw related-record IDs, used Unicode glyphs instead of the original icon language, stretched status chips inside narrow cards, and forced long names and checklist text into cramped columns.

The repair reuses the original OS's relevant patterns: compact register tables, table/Kanban switching, summary bands, filter toolbars, SVG line icons, linked detail dialogs, an off-canvas mobile drawer, internally scrolling tables, and tabbed settings. The clone's existing APIs, permissions, calculations, authentication, Demo/Real boundary, document handling, meeting scheduler, Wayne direction, and OpenEdge sidecar were preserved.

## Corrections

- Established a 1680 px maximum operational canvas with 24 px desktop gutters and no scale or zoom transform.
- Replaced CRM, Projects, Quotations/Invoices, Tenders, Funding, Compliance, and Documents card walls with readable registers and compact summaries.
- Restored Projects Table/Board views and tender readiness detail/checklist dialogs.
- Added meaningful project, invoice, client, tender, funding, and compliance names to service responses instead of exposing raw IDs.
- Standardised SVG navigation icons, button sizes, inputs, table rows, badges, status colours, focus states, empty states, and administrator integration cards.
- Separated detailed OpenEdge, PAS, Wayne, LiveAvatar, and email diagnostics into Settings → Integrations.
- Corrected mobile drawer hierarchy, Meet Wayne access, contained table scrolling, touch targets, and internally scrolling dialogs.
- Backed up the live database and UI files to `data/backups/ui-repair-20261023-2245` before cleanup.
- Removed only positively identified Demo verification fixtures and their dependants: 4 clients, 3 projects, 5 tasks, 5 meetings, 3 tenders, 3 funding records, 3 quotations/invoices, 2 documents, 2 compliance items, and their linked jobs, updates, payments, checklists, expenses, milestones, actions, and audit entries. Real Mode was untouched.
- Added `IX_DATA_DIR` support and `npm run verify:api:isolated` so future workflow tests use a temporary database and cannot pollute Demo or Real data.

## Verification performed

- Static checks and deterministic business tests: 5/5 passed.
- Isolated API workflow: passed create/edit/save/reload, project/task evidence, quotation conversion, duplicate-payment protection, tender and funding readiness, compliance, document upload/download, meeting reschedule/cancel/actions, CSV exports, role denial, and Demo/Real isolation.
- Browser layout matrix: 78/78 route-width checks passed across all 13 sidebar routes at 1920, 1440, 1280, 1024, 768, and 390 px. No page-level horizontal overflow was found; wide registers scroll within their own container.
- Browser interaction checks: CRM search returned one matching row; Projects rendered four Kanban columns and six table rows; tender detail showed its six-item checklist; Settings rendered three integration cards; the 390 px project dialog remained inside the viewport and scrolled internally.
- Mode check: Real Mode displayed six zeroed operational KPIs and an empty review state; switching back restored the coherent Demo metrics (18 tenders, 6 projects, 4 overdue tasks, R245,000 receivables, R180,000 funding need, and 7 open meeting actions).
- Rendered desktop screenshots were captured from a 1440 × 1000 viewport at 100% browser zoom for Dashboard, CRM, Projects, Tenders, and Settings, from both the backed-up pre-repair clone and the repaired clone. Pages with a vertical scrollbar have a 1425 px content image because the browser reserves a 15 px scrollbar gutter.

## Remaining blockers

- OpenEdge and PAS were subsequently connected as the authoritative live repository. SQLite remains only a compatibility cache that is restored from OpenEdge after restart; browser writes fail closed if OpenEdge rejects them.
- Wayne's LiveAvatar transport is implemented, but a dedicated `LIVEAVATAR_WAYNE_AGENT_ID` is still required. The authorised PathBridge agent was verified as interview-specific and is deliberately not reused.
- The SMTP delivery adapter is implemented. This environment has no authorised SMTP host/from configuration, so it remains in honest preview mode and does not mark messages sent.

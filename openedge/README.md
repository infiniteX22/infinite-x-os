# OpenEdge integration package

This directory contains the live OpenEdge 12.8 persistence and ABL service boundary used by the clone.

- `infinite-x.df` contains the typed core schema plus `IXRepositoryRecord` / `IXRepositoryMeta` for all retained operational entities.
- `InfiniteX/BusinessRules.cls` enforces modes, task transitions, tender readiness, invoice balances and funding gaps.
- `sync-repository.p` validates entity, mode and role/operation permission, then commits a full mode snapshot transactionally with revision evidence.
- `export-repository.p` performs token-protected reads used for restart hydration and independent verification.
- `InfiniteX/RepositoryHandler.cls` is the authenticated PAS WEB transport read service.
- `infinitex.handlers` maps `/health`, `/records/{mode}` and `/records/{mode}/{entity}`.

Runtime locations:

- Database: `data/openedge/ixosoe`
- Database broker: `127.0.0.1:4335`
- PAS instance: `data/pasoe/ixos`
- PAS service: `http://127.0.0.1:4326/web/infinitex`
- Server-only token: `data/openedge/service-token.txt` (ignored by Git)

Start both local services with `scripts/start-services.ps1`; stop them cleanly with `scripts/stop-services.ps1`. The Node adapter treats OpenEdge as authoritative. SQLite is a compatibility cache and is replaced from OpenEdge on startup or after a rejected write.

The installed Dev Studio licence reports local-login-only broker access. This is sufficient for the local challenge environment and is not represented as a deployable remote database licence.

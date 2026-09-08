# Completion plan — shared-core

Status: planned. This file is not a test receipt. Required: focused and full shared regression, build, independent review, source-bound evidence and telemetry. Integration tests run within backend container to avoid publishing PostgreSQL. Money/auth/stale-source guards require mutation tests.

Shared invariant/concurrency/restart tests precede interface implementation.

Criterion coverage is populated with actual executable test names after implementation; its absence intentionally blocks Phase3 completion.

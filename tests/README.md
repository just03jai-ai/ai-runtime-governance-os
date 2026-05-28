# Testing Infrastructure

The test suite focuses on deterministic governance infrastructure:

- RuntimeEvidence schema stability
- governance contract and policy validation
- verifier confidence scoring
- pipeline stage execution
- findings aggregation and route summaries

Fixtures in `tests/fixtures` are normalized operational data. Tests should not
depend on browser timing, external network calls, or AI inference.

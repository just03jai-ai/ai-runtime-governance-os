# Verifier Agent

Deterministic verification for governance findings.

`VerifierAgent` validates finding consistency against normalized runtime evidence, suppresses duplicates, checks DOM and screenshot evidence, recalculates confidence, and returns `VerifiedFinding[]`. It does not use LLMs and does not create new governance findings.

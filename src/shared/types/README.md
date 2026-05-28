# Shared Types

Platform-level shared types that are not owned by one runtime or governance domain.

## Typing Strategy

Shared operational contracts are the dependency root for agents, runtime services, governance validation, verification, analysis, and reports.

Rules:

- Shared types must not import from `agents`, `runtime`, `governance`, or `reports`.
- Domain modules may re-export shared types for backwards compatibility.
- Future agents should depend on these contracts instead of defining local finding, evidence, severity, or confidence shapes.
- Types model deterministic operational data only; they do not encode AI inference or autonomous reasoning state.

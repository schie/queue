# Copilot Instructions

- Follow the TypeScript queue implementation and README; keep status/callback semantics and generation guards intact.
- Keep processing single-consumer and in-order; do not introduce parallel execution or reordering by default.
- Maintain status integrity (Idle/Processing/Paused/Cancelled) and only fire `onStatusChange` on real transitions.
- Preserve `pauseOnError` behavior: surface errors via `lastTaskError`, pause processing, and clear on resume.
- Keep coverage at 100%; prefer `npm test -- --watchman=false` and other `npm` scripts over bespoke commands.
- When updating agent guidance, align changes with `AGENTS.md` in the same PR.

---
name: Feature request
about: Suggest an idea or improvement for @schie/queue
labels: enhancement
---

## Problem

What problem are you trying to solve? Who is affected?

## Proposal

Describe the change you would like to see. Include example API usage, lifecycle expectations (status transitions, pause/resume/cancel), and any callbacks or options that would be added or updated.

## Alternatives

What alternative solutions or workarounds have you considered?

## Additional context

Use cases, expected workload shape (task duration/volume), or related issues/PRs that provide context.

## Checklist

- [ ] I searched existing issues
- [ ] This proposal keeps the queue single-consumer and in-order, or explicitly opts into parallel behavior
- [ ] Status integrity is preserved: no stale generations changing state after cancellation
- [ ] I am willing to help implement or test the change

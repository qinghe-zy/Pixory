# AI Chat Streaming Tail Research Plan

## Goal
Design a product-grade AI streaming message scroll architecture that prevents jitter, supports natural history reading while generation continues, and avoids worse visual errors from height estimation.

## Phases
- [ ] Phase 1: Collect authoritative sources and representative open-source implementations. In progress: first source pass recorded in findings.
- [ ] Phase 2: Inspect Pixory's current chat streaming/list architecture.
- [ ] Phase 3: Compare mature approaches: anchoring, virtualization, height measurement, and streaming detachment.
- [ ] Phase 4: Define a robust architecture and failure rules for virtual tail occupancy.
- [ ] Phase 5: Write a detailed implementation spec with acceptance criteria.

## Constraints
- Android-first React Native / Expo app.
- Do not implement production code during this research/spec phase.
- Avoid designs that rely on whole-message final-height estimation.
- Estimation errors must not move the user's current viewport.
- The final spec must be implementable in Pixory's existing AI chat structure.

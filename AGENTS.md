# Project Agent Instructions

This repository contains **YA Bible Study**, an English-language, mobile-first interactive web application with real-time WebSocket (`/ws`) synchronization and procedural Three.js (`Sacred3DScene`) animations for leader-guided Catholic Young Adult Bible study sessions.

## Read First

- `CONTEXT.md` — canonical domain language (`Study Leader`, `Participant`, `Gospel Reading`, `Volunteer Turn`, `Sacred3DScene`).
- `ARCHITECTURE.md` — `src/client`, `src/server`, and `src/shared` boundaries, unified single-port `/api` + `/ws` topology, and verification layers.
- `CONSTRAINTS.md` — non-negotiable repo invariants (dynamic `ws(s)://`, `allowedHosts: true`, `Participant` terminology, Gospel-only Section 3, server-enforced gating, `>= 16px` mobile inputs, WebGL budget).
- `docs/build-brief.md` — problem, target users, MVP vertical slice, non-goals, and validation plan.
- `docs/domain-model.md` — entities, lifecycles, state transitions, and the canonical *"Great Is Your Faith"* (Matthew 15:21–28) seed content.
- `docs/risks-and-open-questions.md` — active assumptions, technical risks, and implementation-time decisions.

Read domain-specific docs when relevant:

- `DESIGN.md` — **required whenever touching UI, layout, typography, colors, `motion/react` micro-interactions, `Sacred3DScene`, or referencing `ux/*.png`**.
- `docs/user-and-access-model.md` — when touching roles, room codes/QR, Leader PIN lock, `VolunteerTurn` gating, override rules, or ephemeral privacy.
- `docs/technical-discovery.md` — when touching stack, single-port `/ws` server, deterministic `.pdf`/`.md` parsing, `zustand` 60fps bridge, Cloudflare HTTPS tunnel (`npm run share`), or iOS/Android session hardening.

## Startup Workflow

Before writing code:

1. Confirm the working directory with `pwd`.
2. Read `PROGRESS.md` for current verified state and next step.
3. Read `feature_list.json` and pick the first dependency-ready unfinished feature in list order.
4. Run `./init.sh`.
5. If baseline verification fails, fix the baseline before adding new feature work.

## Working Rules

- Work on one feature at a time.
- Use `Participant` (never `Assistant`) across all English UI copy and domain types, and present **only the Gospel Reading** as the main reading in Section 3.
- Enforce `Study Leader` section-advancement exclusivity and selected-volunteer `Done` gating on the `/ws` server, not only in client UI.
- Do not mark a feature complete just because code was added.
- Keep changes inside the selected feature scope unless a blocker requires a narrow supporting fix.
- Do not silently change verification rules during implementation.
- Update durable repo artifacts instead of relying on chat summaries.

## Required Artifacts

- `feature_list.json`: source of truth for feature state, dependencies, verification steps, and evidence.
- `PROGRESS.md`: current verified state and lightweight session log.
- `init.sh`: standard non-blocking startup and baseline verification gate (`npm run typecheck`, `npm test`, `npm run build`); run `npm run test:e2e` for Playwright browser/single-port verification.

## Definition Of Done

A feature is done only when all are true:

- target behavior is implemented,
- required verification actually ran and passed,
- concrete evidence is recorded in `feature_list.json` and `PROGRESS.md`,
- repository remains restartable from `./init.sh`,
- relevant docs are updated if product behavior, domain rules, API, or verification changed.

## End Of Session

Before ending a session:

1. Update `PROGRESS.md`.
2. Update `feature_list.json`.
3. Record unresolved risks or blockers.
4. Leave the repo clean enough for the next session to run `./init.sh` immediately.

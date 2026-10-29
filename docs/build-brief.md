# Build Brief

## Problem

Young adult Catholic Bible study groups (attendees in their 20s and 30s) rely on static printed handouts or plain PDFs passed around on phones. During a 90-minute session:
- Participants lose track of the current prayer, passage, or reflection question—or jump ahead out of sync with the facilitator.
- Asking for volunteers to pray or read the Gospel aloud often stalls in awkward silence, with no graceful, low-friction way to volunteer or select someone fairly.
- Facilitators juggle separate notes, Scripture text, and timing cues without a unified control surface.
- Static documents feel flat on mobile devices rather than contemplative, communal, and engaging for young adults.

## Current Workaround / Existing System

Today, the `Study Leader` prepares a structured weekly `.pdf` or `.md` document (such as *"Great Is Your Faith"* on Matthew 15:21–28), shares it via messaging apps or printouts, asks verbally for volunteers, and manually tracks who speaks and when to move on.

## Target Users

1. **Study Leader** (1 per `Live Session`): Parish young adult coordinator or peer facilitator leading a 90-minute in-person or hybrid Bible study from a phone, tablet, or laptop.
2. **Participants** (~5–25 per `Live Session`): Young adults in their 20s and 30s joining primarily from iOS Safari and Android Chrome browsers without installing a native app or creating an account.

## Goals

- Deliver an English-language, mobile-first interactive web app (`YA Bible Study`) synchronized in real time via WebSockets (`/ws`).
- Enforce strict leader pacing: **only** the `Study Leader` can advance sections, while gated `Volunteer Turns` (**Opening Prayer** and **Gospel Reading**) unlock advancement once the selected `Participant` taps `Done` / `Done Reading`.
- Make volunteering effortless via interactive `Raise Hand` / `Read aloud` actions and a fair `Random Selection` fallback (with a 30-second countdown, `Retry`, and `Confirm selection`).
- Preload the complete *"Great Is Your Faith"* (Matthew 15:21–28) study and deterministically parse newly uploaded `.pdf` or `.md` files that follow the same weekly study structure—without external AI API dependencies.
- Foster deeper participation in **Deep Analysis & Discussion** through live responses (with optional anonymity), facilitator-only `Pastoral Leader Notes`, and a private, downloadable `"Lord, Help Me"` `Prayer Card`.
- Elevate the contemplative atmosphere with interactive Three.js PBR scenes (`Sacred3DScene`) tailored to each stage.
- Provide a desktop `Dual Side-by-Side Mode` so a single operator or tester can control the `Study Leader` view and switch across `Participant` views simultaneously.

## Non-Goals

- **User accounts or permanent personal profiles**: No email/password/OAuth registration; sessions use room codes/QR links and display names.
- **Permanent cloud storage of personal prayers or reflections**: Session state is ephemeral and cleared when the session ends.
- **Multi-reading liturgy sequence in Section 3**: Section 3 (`Gospel Reading`) displays **only the Gospel** as the main reading (not separate volunteer turns for Reading 1, Psalm, and Reading 2).
- **LLM/AI API parsing**: Document ingestion uses deterministic text/heading extraction, not paid external AI calls.
- **Native App Store / Google Play apps or built-in voice/video chat**: The app accompanies a live group conversation via mobile web browsers.

## MVP Slice

One complete end-to-end vertical slice supporting both real multi-device mobile sessions and desktop `Dual Side-by-Side Mode`:
1. **Welcome & Role Selection**: Choose `Study Leader` (protected by session PIN/lock) or `Participant` (join via session code/QR + display name), or launch `Dual Side-by-Side Mode` on desktop.
2. **Leader Study Setup (`Load Your Study`)**: Select the pre-analyzed `"Great Is Your Faith"` study or upload a structured `.pdf` / `.md` study file with live section detection preview.
3. **Title Lobby**: Display study title, Scripture citation, attendee count, section count, estimated duration, join code/QR, `Sacred3DScene` sanctuary emblem, and leader-only `Start Study`.
4. **Section 1 — Opening Prayer**: `Participant` hand-raise orb, `Study Leader` volunteer list + `Pick Randomly`, exclusive `"YOU WERE CHOSEN"` prayer screen with `Done` button unlocking leader advancement.
5. **Section 2 — Icebreaker**: Main & follow-up prompt, leader `"Examples to Listen For"`, participant hand-raise to share verbally, and leader `Begin Reading` control.
6. **Section 3 — Gospel Reading**: Full Gospel passage (Matthew 15:21–28), `Read aloud` volunteer orb, `Random Selection` (30s countdown, `Retry`, `Confirm selection`), exclusive `Done Reading` gate, and `Sacred3DScene` Gospel codex.
7. **Section 4 — Deep Analysis & Discussion**: Curated active question queue + access to all 12 reflection questions, verse-by-verse analysis (A–J), and Catholic doctrine notes; live `Participant` reflection feed (named or anonymous); private/downloadable `"Lord, Help Me"` `Prayer Card` with optional single-prayer sharing.
8. **Section 5 — Closing Prayer**: Session metrics summary, next week announcement, weekly practical challenges, closing prayer text, `Sacred3DScene` star of faith, and leader `Finish study`.

## Validation Plan

- **Automated end-to-end verification**: Multi-context browser tests (Playwright) verifying that `Participant` clients cannot advance sections, that volunteer selection shows `Done` only to the chosen `Participant`, that `Done` unlocks the `Study Leader` advance action, and that `/ws` state updates propagate across clients and `Dual Side-by-Side Mode`.
- **Parser verification**: Unit/integration tests confirming deterministic extraction on both the canonical `"Great Is Your Faith"` structure (`.md` and generated `.pdf`) and a second synthetic weekly study following the same heading template.
- **Mobile & 3D smoke verification**: Responsive viewport checks (iPhone/Android sizes + desktop dual view) confirming `Sacred3DScene` renders smoothly and degrades gracefully when WebGL is unavailable or reduced motion is enabled.

## Success Criteria

- A `Study Leader` and multiple `Participants` on mobile browsers can complete all 5 `Study Sections` from setup to `Finish study` without state desynchronization or deadlocks.
- Uploading a new `.pdf` or `.md` file with the standard weekly study structure populates title, Opening Prayer, Icebreaker, Gospel Reading, Deep Analysis questions/notes, Practical Challenges, and Closing Prayer without code changes.
- In every stage, UI copy uses `Participant` (never `Assistant`), Section 3 presents only the `Gospel Reading`, and visual polish matches `DESIGN.md` and the `ux/` reference flow.

## Notes

- Detailed role permissions and leader-lock / disconnect-recovery rules live in `docs/user-and-access-model.md`.
- Entity lifecycles, state transitions, and the canonical *"Great Is Your Faith"* content mapping live in `docs/domain-model.md`.
- Stack, `/ws` protocol, PDF/MD parsing, testing, and operational rules live in `docs/technical-discovery.md`.

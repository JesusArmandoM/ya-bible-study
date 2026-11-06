# Build Brief

## Problem

Young adult Catholic Bible study groups (attendees in their 20s and 30s) rely on static printed handouts or plain PDFs passed around on phones. During a 90-minute session:
- Participants lose track of the current prayer, passage, analysis point, or reflection question—or see distracting lobby/setup chrome above the active section.
- Asking for volunteers to pray, break the ice, or read the Gospel aloud often stalls in awkward silence, with no instant "first hand wins" mechanism or engaging random selection fallback.
- Facilitators juggle separate notes, Scripture text, latecomer room codes, and forward/backward pacing without a unified control surface.
- Small, static text on mobile devices is hard to read aloud and feels flat rather than contemplative, communal, and engaging.

## Current Workaround / Existing System

Today, the `Study Leader` prepares a structured weekly `.pdf` or `.md` document (such as *"Great Is Your Faith"* on Matthew 15:21–28), shares it via messaging apps or printouts, asks verbally for volunteers, and manually tracks who speaks and when to move forward or revisit an earlier section.

## Target Users

1. **Study Leader** (1 per `Live Session`): Parish young adult coordinator or peer facilitator leading a 90-minute in-person or hybrid Bible study from a phone, tablet, or laptop.
2. **Participants** (~5–25 per `Live Session`): Young adults in their 20s and 30s joining primarily from iOS Safari and Android Chrome browsers without installing a native app or creating an account.

## Goals

- Deliver an English-language, mobile-first interactive web app (`YA Bible Study`) synchronized in real time via WebSockets (`/ws`).
- **Enforce exclusive full-screen stage isolation post-join**: Once joined, unmount the Welcome & stage-switcher chrome so each screen covers the entire viewport. Before the study begins, `Participants` see **only** a full-screen waiting view (*"The study leader will begin shortly"* with a 3D emblem), while the `Study Leader` sees a clean full-screen Lobby view with `Start Study` and QR sharing.
- **Render full-screen 3D section entry animations**: Whenever the `Study Leader` starts the study or transitions into any `Study Section` (forward or backward), cover the entire screen for a few seconds with a section-specific 3D `Sacred3DScene` animation describing which section is starting.
- **Support bidirectional leader pacing across 6 sections**: Allow **only** the `Study Leader` to move forward (`Next Section`) or backward (`Previous Section`) across all 6 sections—including a dedicated **Deep Analysis** (`Section 4 of 6`) parsed from the `.pdf` / `.md` study document. Previously completed volunteer turns remain unlocked when navigating back (with an option to reset/re-pick if desired).
- **Make volunteering instant via First-Hand-Wins & full-screen 3D Random Selection**:
  - The **first** `Participant` to tap `Raise Hand` (or `Read aloud`) in **Opening Prayer**, **Icebreaker**, or **Gospel Reading** automatically wins the turn (`selectedMemberId`).
  - If nobody raises their hand, the `Study Leader` clicks `Pick Randomly`: `Participants` see **only** the full-screen 3D `Sacred3DScene` random picker animation for a few seconds until the winner is automatically locked in and revealed to everyone, with a high-visibility `"YOU WERE CHOSEN"` screen for the selected `Participant`.
- **Animate text appearance and increase typography scale**: Reveal section text (prayers, prompts, Gospel passage, Deep Analysis breakdown, and discussion questions) with smooth staged animations and larger, easier-to-read font sizes across mobile and desktop screens.
- **Allow anytime Leader QR Code re-sharing**: Provide the `Study Leader` with a persistent QR Code / Room Code share control across all lobby and in-progress screens so latecomers can scan and join at any time.
- Preload the complete *"Great Is Your Faith"* (Matthew 15:21–28) study and deterministically parse uploaded `.pdf` or `.md` files (including the **Deep Analysis** section) without external AI API dependencies.
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
2. **Leader Study Setup (`Load Your Study`)**: Select the pre-analyzed `"Great Is Your Faith"` study or upload a structured `.pdf` / `.md` study file with live 6-section detection preview.
3. **Full-Screen Post-Join Lobby / Waiting State**:
   - **Participant**: Full-screen view showing **only** *"The study leader will begin shortly"* with a 3D `Sacred3DScene` emblem (no Welcome header or lobby metrics clutter).
   - **Study Leader**: Clean full-screen Lobby view with study overview, attendee count, QR Code share sheet, and `Start Study`.
4. **Full-Screen 3D Section Entry Animations & Persistent Leader Controls**:
   - Entering any of the 6 sections (on study start, `Next Section`, or `Previous Section`) plays a multi-second full-screen 3D `Sacred3DScene` transition describing the section being entered.
   - Across all active sections, the `Study Leader` can open the **Share QR Code** modal at any time for latecomers and navigate backward (`Previous Section`) or forward (`Next Section`).
5. **Section 1 of 6 — Opening Prayer**: Animated larger prayer text, `Participant` hand-raise orb where the **first person to raise hand wins**, `Pick Randomly` triggering a full-screen 3D random-picker animation for Participants until the winner is revealed to everyone, and an unmistakable `"YOU WERE CHOSEN"` view with `Done` unlocking forward advancement.
6. **Section 2 of 6 — Icebreaker**: Full-screen 3D intro, animated larger-print main & follow-up questions, leader `"Examples to Listen For"`, First-Hand-Wins / `Pick Randomly` volunteer turn (`Done Sharing`), and leader forward/backward controls.
7. **Section 3 of 6 — Gospel Reading**: Full-screen 3D intro, animated larger-print Gospel passage (Matthew 15:21–28), First-Hand-Wins `Read aloud` orb, full-screen 3D `Pick Randomly` fallback, high-visibility `"YOU WERE CHOSEN"` / `"<Name> was chosen"` display, and `Done Reading` gate.
8. **Section 4 of 6 — Deep Analysis**: Full-screen 3D intro, dedicated stage displaying the parsed `.pdf` / `.md` **Deep Analysis** breakdown (verse-by-verse commentary `A–J`, Catholic doctrine highlights `A–D`, and young adult applications `A–D`) to both `Study Leader` and `Participants` with animated text reveal and larger typography.
9. **Section 5 of 6 — Discussion & Reflection**: Full-screen 3D intro, curated active question queue + access to all 12 reflection questions and leader notes, live `Participant` reflection feed (named or anonymous), and private/downloadable `"Lord, Help Me"` `Prayer Card`.
10. **Section 6 of 6 — Closing Prayer**: Full-screen 3D intro, session metrics summary, next week announcement, weekly practical challenges, animated larger-print closing prayer text, `Sacred3DScene` star of faith, and leader `Finish study` (or `Previous Section`).

## Validation Plan

- **Automated end-to-end verification (`Playwright`)**: Multi-context browser tests verifying that:
  - Joining unmounts the Welcome/Lobby chrome and shows Participants only *"The study leader will begin shortly"*.
  - Starting the study and moving forward or backward across all 6 sections plays full-screen 3D section-entry animations and occupies the full screen.
  - The first `Participant` to raise their hand automatically wins the turn; `Pick Randomly` displays only the full-screen 3D random picker to Participants during the spin and clearly reveals who was chosen to everyone.
  - Section 4 (`Deep Analysis`) renders the parsed PDF/MD verse-by-verse analysis to both Leader and Participants, text animates in with larger font sizes, and the Leader can re-share the QR code from any active section.
- **Parser & State-Machine Unit Tests (`Vitest`)**: Confirm deterministic 6-section `.pdf`/`.md` extraction (including `Deep Analysis`), First-Hand-Wins auto-assignment, automatic random-pick resolution, and bidirectional section navigation with preserved completion state.

## Success Criteria

- Once joined, neither `Participants` nor the `Study Leader` see leftover Welcome headers or stage-switcher cards; `Participants` in the lobby see only *"The study leader will begin shortly"*, and every active section covers the entire screen.
- Every section transition (initial start, forward, and backward across all 6 sections) plays a distinct, multi-second full-screen 3D `Sacred3DScene` animation describing the section being entered.
- Volunteering in Sections 1–3 selects the **first** hand raised immediately; `Pick Randomly` shows `Participants` only the full-screen 3D random picker until the winner is revealed to everyone and prominently highlighted on the chosen `Participant`'s screen.
- Section 4 (`Deep Analysis`) presents the parsed PDF/MD Gospel analysis to all users, all section text appears with smooth animations and increased font sizes, and the `Study Leader` can navigate back to previous sections or re-share the study QR code at any time.

## Notes

- Detailed role permissions and leader-lock / disconnect-recovery rules live in `docs/user-and-access-model.md`.
- Entity lifecycles, state transitions, and the canonical *"Great Is Your Faith"* 6-section content mapping live in `docs/domain-model.md`.
- Stack, `/ws` protocol, PDF/MD parsing, testing, and operational rules live in `docs/technical-discovery.md`.

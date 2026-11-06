# Risks and Open Questions

## Blocking Next Phase

None. All product changes—full-screen post-join isolation, Participant-only *"The study leader will begin shortly"* waiting screen, multi-second full-screen 3D section entry animations across all 6 sections, bidirectional `Study Leader` navigation (`Previous Section` / `Next Section`), First-Hand-Wins auto-selection, full-screen 3D Random Picker spin + automatic high-visibility winner reveal, dedicated Section 4 (`Deep Analysis`) from parsed `.pdf`/`.md`, animated enlarged typography, and anytime `Study Leader` QR Code re-sharing—are confirmed.

## Implementation-Time Questions

1. **Full-Screen 3D Section Entry & Random Picker Duration (`Implementation-time`)**: Exact duration (`~3.0s–3.5s`) for the full-screen 3D section entry overlay (`sectionEnteredAt`) and 3D random picker spin (`randomSpinEndsAt`), plus accelerated (`~0.4s`) timing when `prefers-reduced-motion: reduce` is enabled or during automated tests.
2. **Existing E2E & Unit Test Updates (`Implementation-time`)**: Existing tests that assert 5 sections (`SECTION X OF 5`), manual `Choose` queue confirmation after `Raise Hand`, or 30s `Confirm selection` after `Pick Randomly` will be updated alongside each new feature slice to verify the 6-section flow, First-Hand-Wins auto-assignment, automatic 3D random picker reveal, and full-screen isolation.

## Resolved Questions

- **Post-Join Lobby Visibility (`Resolved`)**: Participants see **only** a full-screen waiting view (*"The study leader will begin shortly"*) with a 3D emblem; the `Study Leader` sees a clean full-screen Lobby view with `Start Study` and `Share QR Code`; the Welcome hero and stage-switcher card unmount completely once joined.
- **Deep Analysis Section Placement (`Resolved`)**: Added as a dedicated `Section 4 of 6 — Deep Analysis` between **Gospel Reading** (`Section 3 of 6`) and **Discussion & Reflection** (`Section 5 of 6`), visible to both `Study Leader` and `Participants` with the parsed `.pdf`/`.md` breakdown (`A–J` commentary, `A–D` doctrine, `A–D` application).
- **Volunteering & Random Picker Flow (`Resolved`)**: First person to raise their hand in Sections 1, 2, or 3 wins immediately; `Pick Randomly` displays **only** the full-screen 3D random picker to Participants for a few seconds and then automatically locks in and reveals the winner to everyone (with a prominent `"YOU WERE CHOSEN!"` view for the chosen Participant).
- **Backward Navigation & Turn Unlock State (`Resolved`)**: Navigating back (`Previous Section`) triggers the target section's full-screen 3D entry animation and preserves previously completed volunteer turns as unlocked so the `Study Leader` can move freely (with an optional reset/re-pick control).

## Later / Not MVP

- **Multi-room persistent parish dashboard (`Later`)**: Storing historical session attendance metrics across an entire liturgical year.
- **Built-in Bible API lookup (`Later`)**: Auto-fetching full USCCB NABRE Gospel text by verse citation alone when an uploaded PDF includes only `"Matthew 15:21–28"`.
- **Horizontal multi-instance scaling (`Later`)**: Moving in-memory `/ws` room state to Redis pub/sub or Cloudflare Durable Objects if dozens of parishes run concurrent rooms on one deployment.

## Assumptions

- Weekly study `.pdf` files uploaded by the `Study Leader` are text-based PDFs (selectable text, not scanned photographs requiring OCR) and follow the numbered section conventions of *"Great Is Your Faith"* (including `8. Deep Analysis`, `9. Catholic Doctrine`, and `10. Application`).
- During in-person or hybrid meetings, participants speak prayers, icebreaker reflections, and the Gospel reading aloud in the room (or external call), so the web app coordinates **turn-taking, Scripture text, Deep Analysis reading, and live text reflections** rather than streaming microphone audio.

## Risks

| Risk | Impact | Mitigation |
| :--- | :--- | :--- |
| **Chosen volunteer locks phone or loses mobile signal mid-turn** | Forward advancement could stall if strictly gated on `Done` | Provide `Study Leader` with `"Pick Randomly Again"` and `"Mark Done (Leader Override)"` safeguards, and keep previously completed sections unlocked when navigating backward. |
| **Full-screen 3D overlays creating extra WebGL contexts** | Context loss on iOS Safari if multiple `<Canvas>` instances mount | Reuse the persistent `Sacred3DScene` WebGL canvas (or single active canvas per viewport) across waiting, section-entry, random-picker, and in-section views, with automatic 3D-styled SVG/CSS fallback when WebGL is unavailable. |
| **Late-joining participant arrives mid-study** | Newcomer misses earlier lobby QR screen | Provide a persistent `Share QR` button in the `Study Leader` header across all 6 sections so latecomers can scan at any time and hydrate directly into the active section. |
| **Small text fatigue during 90-minute mobile sessions** | Difficulty reading prayers, Gospel verses, or Deep Analysis aloud | Enlarge typography across all sections (`>= 21px` italic serif for prayers/Scripture, `>= 18px` body for Deep Analysis & prompts) and reveal text with smooth staggered animations. |

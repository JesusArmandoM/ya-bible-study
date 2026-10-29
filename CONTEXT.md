# Context

## Glossary

### Study Leader
The single facilitator who controls a `Live Session` from setup to completion. Only the Study Leader can load a `Study Document`, start the study, select or confirm a volunteer, trigger `Random Selection`, switch active discussion questions, view pastoral leader notes, and advance from one `Study Section` to the next.

### Participant
An attendee (young adult in their 20s or 30s) who joins a `Live Session` from a mobile or desktop browser. A Participant follows the active `Study Section` in real time, can raise their hand to pray or read aloud, receives exclusive turn controls when chosen, submits live reflections, and completes a personal `Prayer Card`.

### Live Session
An active, ephemeral real-time Bible study room synchronized over WebSockets (`/ws`). A Live Session is identified by a joinable session code/link, holds at most one active `Study Leader` (protected by a Leader PIN/claim lock), and resets personal interaction data when closed.

### Study Document
A structured Bible study curriculum—either the built-in `"Great Is Your Faith"` study (Matthew 15:21–28) or an uploaded `.pdf` / `.md` file following the same numbered section template—parsed deterministically into the five interactive `Study Sections`, Gospel text, discussion prompts, and pastoral notes.

### Study Section
One of the five sequential, leader-gated stages of a `Live Session`:
1. **Opening Prayer** (`Section 1 of 5`)
2. **Icebreaker** (`Section 2 of 5`)
3. **Gospel Reading** (`Section 3 of 5`)
4. **Deep Analysis & Discussion** (`Section 4 of 5`)
5. **Closing Prayer** (`Section 5 of 5`)

### Volunteer Turn
A gated participation sub-flow used in **Opening Prayer** and **Gospel Reading**. Participants may `Raise Hand` (or tap `Read aloud`), or the `Study Leader` may run `Random Selection`. Once a single `Participant` is confirmed, only that chosen Participant sees the turn prompt and `Done` / `Done Reading` action, which unlocks the Study Leader's ability to advance to the next `Study Section`.

### Random Selection
A leader-triggered volunteer picker used when no one raises their hand (or at the leader's discretion). It randomly selects an eligible `Participant`, notifies them with a 30-second acceptance countdown, and lets the `Study Leader` either `Retry` or `Confirm selection`.

### Gospel Reading
The sole main Scripture proclamation in `Section 3 of 5` (e.g., Matthew 15:21–28 for `"Great Is Your Faith"`), read aloud by the selected `Participant`.

### Pastoral Leader Notes
Facilitator-only guidance extracted from the `Study Document` (such as icebreaker examples to listen for, theological guardrails on Israel and the Church, verse-by-verse commentary A–J, and sample reflection answers) shown exclusively on the `Study Leader` interface.

### Live Reflection
An ephemeral text response submitted by a `Participant` (with their display name or an optional anonymous toggle) to the currently active prompt in **Deep Analysis & Discussion**, broadcast in real time to the session feed.

### Prayer Card ("Lord, Help Me")
A private three-part personal prayer card created by a `Participant` during **Deep Analysis & Discussion** (*For myself*, *For someone I love*, *For the Church/world*), kept locally/downloadable on the Participant's device with optional voluntary sharing of a single prayer.

### Dual Side-by-Side Mode
A desktop viewport mode that renders a synchronized `Study Leader` screen and `Participant` screen (with a participant switcher) side by side over `/ws` for live demonstration, rehearsal, and end-to-end testing.

### Sacred3DScene
The procedural Three.js WebGL component with studio PBR lighting that renders an interactive 3D sacred emblem adapted to each screen stage (sanctuary emblem, prayer orb, Gospel codex, random-selection polyhedron, and star of faith).

## Rejected / Ambiguous Terms

### Assistant
Use `Participant` instead in all English UI copy, domain docs, and code types. Reason: *"asistente"* in Spanish means attendee/member, whereas `"Assistant"` in English implies a co-leader or helper. (Note: static UX mockups in `ux/` use `"Assistant"`; implementations must render `"Participant"`.)

### Four-Reading Mass Sequence (in Section 3)
Use `Gospel Reading` instead for `Section 3 of 5`. Reason: although background liturgical curricula may mention Old Testament, Psalm, and Epistle readings for context, the interactive reading proclamation in Section 3 presents **only the Gospel** as the main reading of the study.

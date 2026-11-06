# Context

## Glossary

### Study Leader
The single facilitator who controls a `Live Session` from setup to completion. Only the Study Leader can load a `Study Document`, start the study, navigate forward or backward across `Study Sections`, re-share the session QR code at any time, trigger `Random Selection` (or re-pick/override a volunteer turn), switch active discussion questions, and view pastoral leader notes.

### Participant
An attendee (young adult in their 20s or 30s) who joins a `Live Session` from a mobile or desktop browser. Once joined before the study starts, a Participant sees only a full-screen waiting view (*"The study leader will begin shortly"*). During the study, a Participant experiences full-screen `Section Entry 3D Animations`, follows the active `Study Section` in real time with animated larger-print text, can be the first to raise their hand to win a `Volunteer Turn`, submits live reflections, and completes a personal `Prayer Card`.

### Live Session
An active, ephemeral real-time Bible study room synchronized over WebSockets (`/ws`). A Live Session is identified by a joinable session code/QR link (which the `Study Leader` can re-open and share from any screen for latecomers), holds at most one active `Study Leader` (protected by a Leader PIN/claim lock), and resets personal interaction data when closed.

### Study Document
A structured Bible study curriculum—either the built-in `"Great Is Your Faith"` study (Matthew 15:21–28) or an uploaded `.pdf` / `.md` file following the same numbered section template—parsed deterministically into the six interactive `Study Sections`, Gospel text, verse-by-verse `Deep Analysis`, discussion prompts, and pastoral notes.

### Study Section
One of the six leader-paced, full-screen stages of a `Live Session` (navigable forward and backward by the `Study Leader`):
1. **Opening Prayer** (`Section 1 of 6`)
2. **Icebreaker** (`Section 2 of 6`)
3. **Gospel Reading** (`Section 3 of 6`)
4. **Deep Analysis** (`Section 4 of 6`)
5. **Discussion & Reflection** (`Section 5 of 6`)
6. **Closing Prayer** (`Section 6 of 6`)

### Section Entry 3D Animation
A multi-second, full-screen 3D transition overlay rendered whenever the `Study Leader` starts the study or enters any `Study Section` (moving forward or backward). It covers the entire viewport with a stage-specific 3D `Sacred3DScene` emblem, section number/title, and short description of the section being entered before revealing the section's animated text.

### Volunteer Turn
A gated participation sub-flow used in **Opening Prayer**, **Icebreaker**, and **Gospel Reading**. It follows a **First-Hand-Wins** rule: the first `Participant` to tap `Raise Hand` (or `Read aloud`) automatically wins and is immediately assigned the turn. If no one volunteers, the `Study Leader` triggers `Random Selection`. Once a `Participant` is chosen, everyone sees who was selected, and the chosen Participant sees a high-visibility `"YOU WERE CHOSEN"` view with the exclusive `Done` / `Done Reading` action that unlocks forward advancement (while previously completed sections remain unlocked if the leader navigates back).

### Random Selection
A leader-triggered volunteer picker used when no one raises their hand. When triggered, all screens display a full-screen 3D `Sacred3DScene` random-picker animation (Participants see *only* the 3D random picker while it spins) for a few seconds until the server locks in and reveals the chosen `Participant` to everyone, with a prominent `"YOU WERE CHOSEN"` highlight for the selected Participant and a leader option to re-pick/override if needed.

### Gospel Reading
The sole main Scripture proclamation in `Section 3 of 6` (e.g., Matthew 15:21–28 for `"Great Is Your Faith"`), read aloud by the chosen `Participant`.

### Deep Analysis
`Section 4 of 6`, a dedicated full-screen study stage placed between **Gospel Reading** and **Discussion & Reflection**. It presents the verse-by-verse Gospel breakdown (`A–J`), doctrinal highlights, and young adult applications parsed from the `.pdf` / `.md` `Study Document` to both the `Study Leader` and `Participants` with animated, large-type text.

### Pastoral Leader Notes
Facilitator-only guidance extracted from the `Study Document` (such as icebreaker examples to listen for, theological guardrails on Israel and the Church, and sample reflection answers) shown exclusively on the `Study Leader` interface.

### Live Reflection
An ephemeral text response submitted by a `Participant` (with their display name or an optional anonymous toggle) to the currently active prompt in **Discussion & Reflection** (`Section 5 of 6`), broadcast in real time to the session feed.

### Prayer Card ("Lord, Help Me")
A private three-part personal prayer card created by a `Participant` during **Discussion & Reflection** (`Section 5 of 6`: *For myself*, *For someone I love*, *For the Church/world*), kept locally/downloadable on the Participant's device with optional voluntary sharing of a single prayer.

### Dual Side-by-Side Mode
A desktop viewport mode that renders a synchronized `Study Leader` screen and `Participant` screen (with a participant switcher) side by side over `/ws` for live demonstration, rehearsal, and end-to-end testing.

### Sacred3DScene
The procedural Three.js WebGL component with studio PBR lighting that renders interactive 3D sacred emblems across all waiting, section-entry, in-section, and random-picker animations (sanctuary emblem, prayer orb, hospitality rings, Gospel codex, deep-analysis lantern/scroll, random-selection polyhedron, and star of faith).

## Rejected / Ambiguous Terms

### Assistant
Use `Participant` instead in all English UI copy, domain docs, and code types. Reason: *"asistente"* in Spanish means attendee/member, whereas `"Assistant"` in English implies a co-leader or helper. (Note: static UX mockups in `ux/` use `"Assistant"`; implementations must render `"Participant"`.)

### Four-Reading Mass Sequence (in Section 3)
Use `Gospel Reading` instead for `Section 3 of 6`. Reason: although background liturgical curricula may mention Old Testament, Psalm, and Epistle readings for context, the interactive reading proclamation in Section 3 presents **only the Gospel** as the main reading of the study.

# Domain Model

## Core Concepts

### StudyDocument
Structured representation of a single Bible study session loaded into a `LiveSession`, parsed deterministically into **6 interactive `StudySections`**.
- **Metadata**: `id`, `title` (e.g., `"Great Is Your Faith"`), `subtitle` (`"Mercy, Humility, and the House of Prayer for All Peoples"`), `liturgicalDate` (`"Sunday, August 16, 2026 · Twentieth Sunday in Ordinary Time Year A"`), `gospelCitation` (`"Matthew 15:21–28"`), `estimatedMinutes` (`90`), `sectionCount` (`6`), `centralThemes[]`, `sessionGoals[]`, `oneSentenceMainPoint`.
- **Section Payloads (`1..6`)**:
  1. `openingPrayer` (`section_1_prayer`): title, intro description, suggested prayer text, duration (`5 min`).
  2. `icebreaker` (`section_2_icebreaker`): title (`"Outsiders Wanted"`), intro description, main question, follow-up question, leader note, examples to listen for (`string[]`), duration (`10 min`).
  3. `gospelReading` (`section_3_reading`): citation (`"Matthew 15:21–28"`), intro description, liturgical label, full Scripture text to proclaim aloud, key highlight lines, liturgical context note for the leader, duration (`10 min`).
  4. `deepAnalysis` (`section_4_deep_analysis`): title (`"Deep Analysis of the Gospel"`), intro description, verse-by-verse breakdown (`A..J` with verse citation, quoted line, and theological/spiritual explanation), Catholic doctrine highlights (`A..D`), and young adult application points (`A..D`)—visible to **both** `Study Leader` and `Participants` (`20 min`).
  5. `discussion` (`section_5_discussion`): title (`"Lord, Help Me Pray"`), intro description, active curated prompts (default 3 core questions), full bank of reflection questions (`1..12` with type, suggested/sample answers, and pastoral leader notes), and `prayerCardTemplate` (3 prompts), duration (`25 min`).
  6. `closing` (`section_6_closing`): intro description, session summary bullets, practical weekly challenges (`Options 1..4`), next-week announcement (`"Faith that Endures" — James 1:2–4`), and closing prayer text (`5 min`).

### LiveSession
Active real-time room coordinating one `StudyLeader` and zero or more `Participants`.
- Attributes: `sessionCode` (short alphanumeric room code, re-shareable via QR at any time by the leader), `leaderPin` / `leaderToken`, `status` (`"setup"` | `"lobby"` | `"in_progress"` | `"completed"`), `studyDocument`, `currentSectionIndex` (`0..5` once active), `currentSectionId`, `sectionEnteredAt` (timestamp driving the synchronized multi-second full-screen 3D section-entry animation), `completedSectionIds[]` (sections whose gated `VolunteerTurn` has already been completed so backward navigation never re-locks the leader), `startedAt`, `endedAt`, `volunteerTurn`, `activeQuestionId`, `reflections[]`, `sharedPrayerItems[]`.

### SessionMember
Connected person inside a `LiveSession`.
- Attributes: `memberId`, `displayName`, `initials`, `avatarPalette`, `role` (`"leader"` | `"participant"`), `connectionStatus` (`"connected"` | `"disconnected"`), `joinedAt`.

### VolunteerTurn
State tracker for gated single-person turns in **Section 1 (Opening Prayer)**, **Section 2 (Icebreaker)**, and **Section 3 (Gospel Reading)**.
- Attributes: `sectionId`, `mode` (`"gated_prayer"` | `"gated_icebreaker"` | `"gated_reading"`), `status` (`"collecting_hands"` | `"random_spinning"` | `"assigned"` | `"turn_completed"`), `selectionMethod` (`"first_hand"` | `"random_pick"` | `"leader_choice"` | `null`), `selectedMemberId`, `selectedMemberName`, `randomSpinStartedAt`, `randomSpinEndsAt` (~3–4s synchronized 3D random-picker animation window), `completedAt`.

### LiveReflection
Participant-submitted response tied to an active question in **Section 5 (Discussion & Reflection)**.
- Attributes: `id`, `questionId`, `authorMemberId`, `authorDisplayName` (or `"Anonymous"` when toggled), `content`, `createdAt`.

### PrayerCard
Participant-owned three-line devotional card created in **Section 5 (Discussion & Reflection)**:
1. *For myself*: `"Lord, help me ___."`
2. *For someone I love*: `"Lord, have mercy on ___."`
3. *For the Church/world*: `"Lord, make Your house a house of prayer for ___."`
- Stored client-side only; downloadable as a keepsake card/image, with optional voluntary broadcast of **one** chosen line to `sharedPrayerItems[]`.

## Relationships

- One `LiveSession` loads exactly one active `StudyDocument` with `6` `StudySections`.
- One `LiveSession` has at most one active `StudyLeader` and `0..N` `Participants`.
- Each gated `StudySection` (`1..3`) owns at most one active `VolunteerTurn` at a time, and records completion in `completedSectionIds[]`.
- Each active discussion prompt in Section 5 collects `0..N` `LiveReflections` for the duration of the `LiveSession`.
- Each `Participant` manages `0..1` private `PrayerCard` locally on their device.

## States and Lifecycles

### 1. LiveSession & Bidirectional Section Lifecycle
1. `setup`: Created when the `StudyLeader` enters **Load Your Study**; leader selects the preloaded study or uploads a `.pdf` / `.md` file.
2. `lobby`: Room is live and joinable via `sessionCode` / QR link.
   - **Full-Screen Isolation**: The Welcome header and stage-switcher card are completely unmounted once joined.
   - **Participant View**: Renders **only** a full-screen waiting view showing *"The study leader will begin shortly"* with a 3D `Sacred3DScene` emblem.
   - **Study Leader View**: Renders a clean full-screen Lobby view with study overview, attendee count, QR Code share modal trigger, and `Start Study`.
3. `in_progress`: Active across the 6 `StudySections`:
   - `section_1_prayer` (`Section 1 of 6 — Opening Prayer`)
   - `section_2_icebreaker` (`Section 2 of 6 — Icebreaker`)
   - `section_3_reading` (`Section 3 of 6 — Gospel Reading`)
   - `section_4_deep_analysis` (`Section 4 of 6 — Deep Analysis`)
   - `section_5_discussion` (`Section 5 of 6 — Discussion & Reflection`)
   - `section_6_closing` (`Section 6 of 6 — Closing Prayer`)
   - **Full-Screen 3D Section Entry Animation**: On `start_study`, `next_section`, or `previous_section`, every connected client renders a multi-second (~3.5s) full-screen 3D `Sacred3DScene` overlay displaying the section's custom 3D emblem, section number/title, and short description before revealing the section's animated content.
   - **Bidirectional Leader Navigation**: Only the `StudyLeader` can trigger `next_section` (moving forward) or `previous_section` (moving back to any earlier section `0..currentSectionIndex-1`). When returning to a previously completed gated section (`sectionId` in `completedSectionIds[]`), forward advancement stays unlocked so the leader can move freely, while offering an optional `Reset / Re-pick Volunteer` control if the leader wishes to run a new turn.
   - **Anytime Leader QR Code Re-Share**: Throughout `lobby` and all 6 `in_progress` sections, the `StudyLeader` has a persistent header trigger to open the QR Code / Join Code modal so latecomers can join and hydrate directly into the active section.
4. `completed`: Triggered when the `StudyLeader` taps `Finish study` in Section 6; displays final summary, then purges ephemeral session reflections and member state on room close/expiry.

### 2. First-Hand-Wins & Full-Screen 3D Random Selection Lifecycle (Sections 1, 2 & 3)
1. `collecting_hands`: Section opens after its 3D entry animation; `Participants` see the interactive `Raise Hand` / `Read aloud` orb and animated section text. If the section has not yet been completed, the `StudyLeader`'s forward `Next Section` button is locked (`Waiting for volunteer to advance`), while `Previous Section` (on Sections 2–6) remains available.
2. **Path A — First-Hand-Wins (`collecting_hands` -> immediate `assigned`)**:
   - The **first** `Participant` to tap `Raise Hand` (or `Read aloud`) immediately wins the turn (`selectedMemberId` is locked in server-side on the first valid `raise_hand` command). Subsequent hand-raise attempts while `assigned` are ignored.
3. **Path B — Full-Screen 3D Random Selection (`collecting_hands` -> `random_spinning` -> automatic `assigned`)**:
   - If nobody raises their hand, the `StudyLeader` clicks `Pick Randomly`.
   - Server selects a fair random connected `Participant` and transitions to `random_spinning` (~3.5s duration) before automatically resolving to `assigned`.
   - **Participant Exclusive Random-Picker Screen**: While `random_spinning` is active, `Participants` see **only** the full-screen 3D `Sacred3DScene` random-picker animation (spinning 3D polyhedron + *"Selecting a participant at random…"*—all other section UI is hidden).
   - **Automatic Winner Reveal (`assigned`)**: When the spin finishes, all screens transition to `assigned` without requiring a separate manual confirm step.
4. `assigned` (**High-Visibility Winner Reveal**):
   - **Everyone Sees Who Was Chosen**: All non-selected `Participants` and the `StudyLeader` see a prominent announcement banner/card with a 3D golden emblem flare showing the chosen participant's avatar and name (`"<DisplayName> was chosen!"`).
   - **Chosen Participant Exclusive View**: The selected `Participant` (`selectedMemberId`) sees a dramatic, high-visibility `"YOU WERE CHOSEN!"` screen with a radiant 3D golden aura, larger animated prayer/prompt/Gospel text, and the exclusive `Done` / `Done Sharing` / `Done Reading` CTA.
   - **Leader Safeguards**: The `StudyLeader` can click `Pick Randomly Again` (to re-roll if someone declines verbally) or `Mark Done (Leader Override)`.
5. `turn_completed`: Triggered when `selectedMemberId` taps `Done` / `Done Sharing` / `Done Reading` (or via leader override). Marks the section in `completedSectionIds[]` and unlocks the `StudyLeader`'s forward CTA to advance to the next `StudySection`.

### 3. Section 4 (`Deep Analysis`) & Section 5 (`Discussion & Reflection`) Lifecycles
1. **Section 4 — Deep Analysis**: Displays the parsed `.pdf` / `.md` verse-by-verse Gospel commentary (`A–J`), Catholic doctrine highlights (`A–D`), and young adult applications (`A–D`) to **both** `StudyLeader` and `Participants` with staggered animated text appearance and enlarged typography for comfortable group reading. Leader can navigate `Previous Section` (back to Section 3) or `Next Section` (to Section 5) at any time.
2. **Section 5 — Discussion & Reflection**: Initializes with 3 curated questions (`Question 1` marked `Active`) plus leader access to the full 12-question bank and pastoral notes. `StudyLeader` can activate any question (`Next question`), add a question (`+ Add`), or navigate `Previous Section` (to Section 4) / `Next Section` (to Section 6).

## Canonical Study Document Mapping ("Great Is Your Faith")

Both the preloaded `"Great Is Your Faith"` seed and the deterministic `.pdf`/`.md` parser map structured study documents into the **6 interactive sections**:

| Source Heading / Block | Target Interactive Stage | Key Seed Content ("Great Is Your Faith" — Matthew 15:21–28) |
| :--- | :--- | :--- |
| Title, Subtitle, Metadata, `1. Central Theme`, `2. Session Goals`, `3. Schedule` | **Lobby (Leader)** & **Waiting View (Participant)** | *Great Is Your Faith* · *Twentieth Sunday in Ordinary Time Year A* · 90m · 6 sections · Participants see only *"The study leader will begin shortly"*. |
| `4. Opening Prayer` | **Section 1 of 6 — Opening Prayer** | 3D Prayer Entry Animation -> *"Lord Jesus Christ, Son of David and Savior of the world, we come before You like the Canaanite woman..."* |
| `5. Icebreaker` | **Section 2 of 6 — Icebreaker** | 3D Icebreaker Entry Animation -> Main: *"Have you ever felt like an outsider spiritually, socially, culturally, or even in the Church?"* Follow-up + 8 YA examples & First-Hand-Wins / Random Selection turn. |
| `Main Gospel Reading` & `6. Proclamation of the Readings` (Gospel block) + `7. Context` | **Section 3 of 6 — Gospel Reading** | 3D Gospel Entry Animation -> **Sole main reading**: Full text of **Matthew 15:21–28** read aloud via First-Hand-Wins or 3D Random Selection. |
| `8. Deep Analysis (A–J)`, `9. Catholic Doctrine (A–D)`, `10. Application (A–D)` | **Section 4 of 6 — Deep Analysis** | 3D Deep Analysis Entry Animation -> Dedicated full-screen stage presenting the parsed verse-by-verse breakdown (`A–J`), Catholic Doctrine (`A–D`), and Young Adult Application (`A–D`) to **both** Leader and Participants. |
| `11. Reflection Questions (1–12)`, `12. Group Activity` | **Section 5 of 6 — Discussion & Reflection** | 3D Discussion Entry Animation -> Default 3 active prompts (Q6, Q5, Q8), expandable bank of all 12 questions with sample answers & pastoral notes, live reflection feed, and `"Lord, Help Me"` 3-part `PrayerCard`. |
| `13. Practical Challenge`, `14. Closing Summary`, `15. Closing Prayer`, `17. Main Point` | **Section 6 of 6 — Closing Prayer** | 3D Closing Entry Animation -> Summary metrics, 4 weekly challenges, Next Week card (*"Faith that Endures" — James 1:2–4*), and full Closing Prayer. |

## Important Scenarios

- **First hand raised wins immediately**: In Section 1, 2, or 3, *Mary Lopez* is the first `Participant` to tap `Raise Hand`. The server immediately locks her in as `selectedMemberId`, broadcasts `"Mary Lopez was chosen!"` to the room, and displays the prominent `"YOU WERE CHOSEN!"` screen on Mary's device with the `Done` button.
- **Zero volunteers raise hand (`Pick Randomly`)**: In Section 1, 2, or 3, no one taps `Raise Hand`. `StudyLeader` clicks `Pick Randomly` -> all `Participants` see **only** the full-screen 3D random-picker animation spinning for ~3.5 seconds -> the picker settles and reveals the chosen `Participant` to everyone, with `"YOU WERE CHOSEN!"` prominently displayed on the winner's screen.
- **Leader navigates back to a previous section**: From Section 4 (`Deep Analysis`), the `StudyLeader` taps `Previous Section` to revisit Section 3 (`Gospel Reading`). All screens play the Section 3 full-screen 3D entry animation and display Section 3; because Section 3 was already completed earlier, forward navigation stays unlocked (with an option to re-run a volunteer turn if desired).
- **Latecomer joins via re-shared QR code**: During Section 4 (`Deep Analysis`), a late `Participant` arrives. The `StudyLeader` taps the persistent `Share QR` header button, the newcomer scans the QR code, enters their name, and lands directly in Section 4.

## Edge Cases

- **Simultaneous hand raises**: Because `/ws` processes messages sequentially on the single Node.js event loop, the first `raise_hand` frame processed while `status === 'collecting_hands'` deterministically wins and transitions the turn to `assigned`.
- **Selected volunteer disconnects or locks phone before tapping `Done`**: The `StudyLeader` can click `Pick Randomly Again` or `Mark complete (Leader override)` so the group is never deadlocked.
- **Zero Participants connected**: If the `StudyLeader` tests solo with `0` participants, `Pick Randomly` is disabled with a clear message and the leader can advance via leader override.
- **Mobile screen sleep / brief network drop**: Client reconnects automatically to `/ws` using stored `memberId` + `sessionCode`, preserving its role, current section (`0..5`), and `assigned` volunteer status.

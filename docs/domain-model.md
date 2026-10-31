# Domain Model

## Core Concepts

### StudyDocument
Structured representation of a single Bible study session loaded into a `LiveSession`.
- **Metadata**: `id`, `title` (e.g., `"Great Is Your Faith"`), `subtitle` (`"Mercy, Humility, and the House of Prayer for All Peoples"`), `liturgicalDate` (`"Sunday, August 16, 2026 · Twentieth Sunday in Ordinary Time Year A"`), `gospelCitation` (`"Matthew 15:21–28"`), `estimatedMinutes` (`90`), `centralThemes[]`, `sessionGoals[]`, `oneSentenceMainPoint`.
- **Section Payloads**:
  1. `openingPrayer`: title, suggested prayer text, duration (`5 min`).
  2. `icebreaker`: title (`"Outsiders Wanted"`), main question, follow-up question, leader note, examples to listen for (`string[]`), duration (`10 min`).
  3. `gospelReading`: citation (`"Matthew 15:21–28"`), liturgical label, full Scripture text to proclaim aloud, key highlight lines, liturgical context note for the leader, duration (`10 min`).
  4. `deepAnalysis`: title (`"Lord, Help Me Pray"`), active curated prompts (default 3 core questions), full bank of reflection questions (`1..12` with type, suggested/sample answers, and pastoral leader notes), verse-by-verse commentary (`A..J`), Catholic doctrine points (`A..D`), young adult application points (`A..D`), and `prayerCardTemplate` (3 prompts), duration (`25–50 min`).
  5. `closing`: session summary bullets, practical weekly challenges (`Options 1..4`), next-week announcement (`"Faith that Endures" — James 1:2–4`), and closing prayer text.

### LiveSession
Active real-time room coordinating one `StudyLeader` and zero or more `Participants`.
- Attributes: `sessionCode` (short alphanumeric room code), `leaderPin` / `leaderToken`, `status`, `studyDocument`, `currentSectionIndex` (`0..4` once active), `startedAt`, `endedAt`, `volunteerTurn`, `activeQuestionId`, `reflections[]`, `sharedPrayerItems[]`.

### SessionMember
Connected person inside a `LiveSession`.
- Attributes: `memberId`, `displayName`, `initials`, `avatarPalette`, `role` (`"leader"` | `"participant"`), `connectionStatus` (`"connected"` | `"disconnected"`), `joinedAt`.

### VolunteerTurn
State tracker for gated single-person turns in **Section 1 (Opening Prayer)** and **Section 3 (Gospel Reading)**, plus open hand-raising in **Section 2 (Icebreaker)**.
- Attributes: `mode` (`"gated_prayer"` | `"open_share"` | `"gated_reading"`), `raisedHands[]` (`memberId`, `raisedAt`), `candidateMemberId` (during pending random selection), `candidateExpiresAt` (30s timer), `selectedMemberId`, `completedAt`.

### LiveReflection
Participant-submitted response tied to an active question in **Section 4**.
- Attributes: `id`, `questionId`, `authorMemberId`, `authorDisplayName` (or `"Anonymous"` when toggled), `content`, `createdAt`.

### PrayerCard
Participant-owned three-line devotional card created in **Section 4**:
1. *For myself*: `"Lord, help me ___."`
2. *For someone I love*: `"Lord, have mercy on ___."`
3. *For the Church/world*: `"Lord, make Your house a house of prayer for ___."`
- Stored client-side only; downloadable as a keepsake card/image, with optional voluntary broadcast of **one** chosen line to `sharedPrayerItems[]`.

## Relationships

- One `LiveSession` loads exactly one active `StudyDocument`.
- One `LiveSession` has at most one active `StudyLeader` and `0..N` `Participants`.
- Each `StudySection` (`1..5`) owns at most one active `VolunteerTurn` at a time.
- Each active discussion prompt in Section 4 collects `0..N` `LiveReflections` for the duration of the `LiveSession`.
- Each `Participant` manages `0..1` private `PrayerCard` locally on their device.

## States and Lifecycles

### 1. LiveSession Lifecycle
1. `setup`: Created when the `StudyLeader` enters **Load Your Study**; leader selects the preloaded study or uploads a `.pdf` / `.md` file.
2. `lobby` (**Title Screen**): Room is live and joinable via `sessionCode` / QR link; `Participants` join and see the waiting title screen while only the `StudyLeader` sees `Start Study`.
3. `in_progress`: Active across sequential `StudySections` (`section_1_prayer` -> `section_2_icebreaker` -> `section_3_reading` -> `section_4_discussion` -> `section_5_closing`). Only the `StudyLeader` triggers forward section transitions.
4. `completed`: Triggered when the `StudyLeader` taps `Finish study` in Section 5; displays final summary, then purges ephemeral session reflections and member state on room close/expiry.

### 2. Gated VolunteerTurn Lifecycle (Sections 1 & 3)
1. `collecting_hands`: Section opens; `Participants` see the `Raise Hand` / `Read aloud` orb. Raising a hand appends the participant with timestamp (`Raised 4s ago`). Leader's section-advance control is **locked** (`Waiting for volunteer to advance`).
2. `random_pending` *(optional branch)*: Triggered when `StudyLeader` taps `Pick Randomly` / `Random`. Server picks an eligible connected `Participant`, starts a **30-second countdown**, notifies the candidate, and shows `StudyLeader` `Retry` and `Confirm selection`.
   - `Retry` picks another eligible `Participant` and resets the 30s timer.
   - Leader `Confirm selection` is the **sole** transition to `assigned` (no participant accept command exists — the "30 seconds to accept" countdown copy is UX only). A confirm attempt after the window elapsed is rejected server-side and prompts `Retry` or a manual pick.
   - Timer expiry without confirmation prompts the leader to `Retry` or pick manually.
3. `assigned`: Exactly one `Participant` (`selectedMemberId`) sees the `"YOU WERE CHOSEN"` view with the suggested prayer or full Gospel text and the exclusive `Done` / `Done Reading` button. Other `Participants` see who is currently praying/reading. Leader's advance button remains locked (with a secondary emergency override only if needed).
4. `turn_completed`: Triggered when `selectedMemberId` taps `Done` / `Done Reading` (or `StudyLeader` invokes emergency override after disconnect). Unlocks the `StudyLeader`'s primary gold button to advance to the next `StudySection`.

### 3. Section 4 Discussion Lifecycle
1. Section 4 initializes with 3 curated questions (`Question 1` marked `Active`) plus leader access to the full 12-question bank, `A–J` Gospel commentary, and Catholic doctrine notes.
2. `StudyLeader` can activate any question (`Next question`), add a question from the 12-question bank or custom input (`+ Add`), and advance to Section 5 (`Closing Prayer`) whenever ready (*"mercy, not pace, is the goal"*).

## Canonical Study Document Mapping ("Great Is Your Faith")

Both the preloaded `"Great Is Your Faith"` seed and the deterministic `.pdf`/`.md` parser map structured study documents into the 5 interactive sections:

| Source Heading / Block | Target Interactive Stage | Key Seed Content ("Great Is Your Faith" — Matthew 15:21–28) |
| :--- | :--- | :--- |
| Title, Subtitle, Metadata, `1. Central Theme`, `2. Session Goals`, `3. Schedule` | **Title Screen** & Leader Overview | *Great Is Your Faith* · *Twentieth Sunday in Ordinary Time Year A* · 90m · 5 sections · Universal mercy, irrevocable covenant with Israel, humble/persistent faith, Catholicity of the Church. |
| `4. Opening Prayer` | **Section 1 — Opening Prayer** | *"Lord Jesus Christ, Son of David and Savior of the world, we come before You like the Canaanite woman..."* |
| `5. Icebreaker` | **Section 2 — Icebreaker** | Main: *"Have you ever felt like an outsider spiritually, socially, culturally, or even in the Church?"* Follow-up: *"When you feel like an outsider, do you usually move closer to Jesus, pull away, become defensive, or stay silent?"* + 8 YA examples & leader note. |
| `Main Gospel Reading` & `6. Proclamation of the Readings` (Gospel block) + `7. Context` | **Section 3 — Gospel Reading** | **Sole main reading**: Full text of **Matthew 15:21–28** (*Jesus withdraws to Tyre and Sidon; the Canaanite woman cries "Have pity on me, Lord, Son of David!" and "Lord, help me"; crumbs from the masters' table; "O woman, great is your faith!"*). Note: Isaiah 56, Psalm 67, and Romans 11 remain available in `7. Biblical & Liturgical Context` leader notes, not as separate reading turns. |
| `8. Deep Analysis (A–J)`, `9. Catholic Doctrine (A–D)`, `10. Application (A–D)`, `11. Reflection Questions (1–12)`, `12. Group Activity` | **Section 4 — Deep Analysis & Discussion** | Default 3 active prompts (Q6 *"What makes the Canaanite woman's faith 'great'?"*, Q5 *"Have you ever experienced God's silence..."*, Q8 *"Where do you need to pray, 'Lord, help me'..."*), expandable bank of all 12 questions with sample answers & pastoral notes (including Romans 11:29 fidelity to Israel, Augustine & Chrysostom on silence, Jerome on faith/patience/humility), plus `"Lord, Help Me"` 3-part `PrayerCard`. |
| `13. Practical Challenge`, `14. Closing Summary`, `15. Closing Prayer`, `17. Main Point` | **Section 5 — Closing Prayer** | Summary metrics, 4 weekly challenges (Persistent Prayer, Humble Prayer, Catholic Hospitality, Eucharistic Humility), Next Week card (*"Faith that Endures" — James 1:2–4*), and full Closing Prayer (*"Lord Jesus, Son of David, have mercy on us..."*). |

## Important Scenarios

- **Zero volunteers raise hand**: In Section 1 or Section 3, no `Participant` taps `Raise Hand` / `Read aloud`. `StudyLeader` taps `Pick Randomly` -> `Random Selection` highlights a connected participant with a 30s timer -> Leader taps `Confirm selection` -> chosen participant receives `"YOU WERE CHOSEN"` -> taps `Done` -> Leader advances.
- **Direct avatar selection in Reading**: In Section 3, `StudyLeader` can also tap a participant's avatar directly from the connected roster (`Choose reader`) if someone volunteers verbally.
- **Desktop Dual Side-by-Side rehearsal**: Operator opens Dual Mode on desktop; left pane renders `StudyLeader`, right pane renders `Participant` with a dropdown to switch between simulated/connected participants (`Mary Lopez`, `Daniel Reyes`, `Sara Castillo`, etc.) over `/ws`.

## Edge Cases

- **Selected volunteer disconnects or locks phone before tapping `Done`**: If `selectedMemberId` disconnects or stalls, the `StudyLeader` has a secondary safeguard action (`Reassign volunteer` or `Mark complete (Leader override)`) so the live group is never deadlocked.
- **Late-joining Participant**: Joining mid-session immediately hydrates the client to `currentSectionIndex`, active question, and live reflection feed via WebSocket snapshot.
- **Zero Participants connected**: If the `StudyLeader` tests solo with `0` participants, `Pick Randomly` is disabled with a clear message and the leader can self-preview/advance via leader override.
- **Mobile screen sleep / brief network drop**: Client reconnects automatically to `/ws` using stored `memberId` + `sessionCode`, preserving its role and current `assigned` volunteer status if active.

## Seed Content Reference: "Great Is Your Faith"

Authoritative source text for the preloaded `StudyDocument` and parser test fixture:

- **Title**: Great Is Your Faith — *Mercy, Humility, and the House of Prayer for All Peoples*
- **Liturgical Occasion**: Sunday, August 16, 2026 · Twentieth Sunday in Ordinary Time, Year A (`~90 minutes`)
- **Main Gospel Reading (Section 3 — Sole Main Reading)**: **Matthew 15:21–28**
  - Key lines: *"Have pity on me, Lord, Son of David!"* · *"Lord, help me."* · *"Even the dogs eat the scraps that fall from the table of their masters."* · *"O woman, great is your faith!"*
  - Supporting Liturgical Context (Leader context notes only, not separate Section 3 reading turns): Isaiah 56:1, 6–7 (*"My house shall be called a house of prayer for all peoples"*); Psalm 67:2–3, 5, 6, 8 (*"O God, let all the nations praise you!"*); Romans 11:13–15, 29–32 (*"The gifts and the call of God are irrevocable"*); Alleluia cf. Matthew 4:23.
- **Four Central Themes**: (1) God's house is for all peoples; (2) God's covenant with Israel is irrevocable; (3) Faith is humble, persistent, and bold; (4) The Church is catholic: universal in mission, mercy, and worship.
- **One-Sentence Main Point**: *The Canaanite woman teaches us that great faith is humble, persistent, and bold, trusting that even the smallest gift of Christ's mercy is enough to heal.*
- **Opening Prayer (Section 1 — 5 min)**:
  > Lord Jesus Christ, Son of David and Savior of the world, we come before You like the Canaanite woman, asking not for what we deserve, but for Your mercy. Teach us to pray with humility, to persevere when You seem silent, and to trust that Your mercy is greater than our limits. Open our hearts to all peoples, purify us from pride and exclusion, and make us living members of Your Catholic Church, a house of prayer for all nations. Amen.
- **Icebreaker ("Outsiders Wanted" — Section 2 — 10 min)**:
  - *Main Question*: "Have you ever felt like an outsider spiritually, socially, culturally, or even in the Church?"
  - *Follow-up*: "When you feel like an outsider, do you usually move closer to Jesus, pull away, become defensive, or stay silent?"
  - *Examples to Listen For*: Feeling spiritually behind others; not knowing enough about the faith; being new to a parish or young adult group; feeling judged because of past sins; being single while others are married; feeling culturally different; feeling unworthy to pray; feeling ignored by God during suffering.
- **Deep Analysis Verse-by-Verse (Section 4 Leader Commentary A–J)**:
  - *A (15:21)*: "Jesus withdrew to the region of Tyre and Sidon" — Gentile border territory; exposes false external purity vs. true faith of the heart.
  - *B (15:22a)*: "A Canaanite woman... came and called out" — Messianic recognition (*"Have pity on me, Lord, Son of David!"*); faith as personal adherence (CCC 150–152).
  - *C (15:22b)*: "My daughter is tormented by a demon" — Intercessory love making another's suffering her own.
  - *D (15:23a)*: "But Jesus did not say a word in answer to her" — Divine silence is not abandonment; St. Augustine & St. John Chrysostom teach delay enkindles desire and reveals hidden faith.
  - *E (15:23b)*: "Send her away" — Warning against closed religious social clubs seeing wounded seekers as interruptions.
  - *F (15:24)*: "I was sent only to the lost sheep of the house of Israel" — Salvation-historical order: first Israel (CCC 839–840), then the nations gathered in Christ.
  - *G (15:25)*: "Lord, help me" — Unperformed, surrendered prayer of faith heard by Jesus (CCC 2607–2616).
  - *H (15:26)*: "It is not right to take the food of the children and throw it to the dogs" — Drawing forth hidden virtue; St. Jerome (via Aquinas' *Catena Aurea*) highlights faith, patience, and humility.
  - *I (15:27)*: "Even the dogs eat the scraps that fall from the table of their masters" — Humility (not self-hatred) echoing *"Lord, I am not worthy..."*; mercy is received, not earned.
  - *J (15:28)*: "O woman, great is your faith!" — Christ-centered, humble, persistent, bold, intercessory faith admired by Jesus.
- **Catholic Doctrine Highlights (Section 4 Leader Notes A–D)**: (A) Plan begins with Israel and opens to all nations; (B) Gifts and call of God are irrevocable (Romans 11:29 — reject all anti-Jewish contempt); (C) Catholicity = universality in Christ's presence and mission (CCC 830–856); (D) Firm in truth, wide in mercy.
- **12 Reflection Questions (Section 4 Bank)**:
  1. Which reading stands out to you most: Isaiah, Psalm 67, Romans, or the Gospel? Why? *(Personal reflection)*
  2. What does Isaiah mean when he says God's house is "a house of prayer for all peoples"? *(Doctrinal/discussion)*
  3. Why is it important that Romans says, "The gifts and the call of God are irrevocable"? *(Doctrinal — guard against anti-Jewish framing)*
  4. Why do you think Jesus is silent at first with the Canaanite woman? *(Theological reflection)*
  5. Have you ever experienced God's silence in prayer? How did you respond? *(Personal — default active queue #2; handle gently)*
  6. What makes the Canaanite woman's faith "great"? *(Textual/doctrinal — default active queue #1)*
  7. What is the difference between humility and low self-worth? *(Practical/spiritual)*
  8. Where do you need to pray, "Lord, help me," right now? *(Personal — default active queue #3)*
  9. Who are the people we are tempted to "send away" today? *(Group discussion)*
  10. What does this Gospel teach us about intercessory prayer? *(Doctrinal/practical)*
  11. How can a young adult Catholic community become more like "a house of prayer for all peoples"? *(Practical application)*
  12. What is one concrete way you can imitate the Canaanite woman this week? *(Action step)*
- **Group Activity — "Lord, Help Me" Prayer Card (Section 4)**:
  1. *For myself*: `"Lord, help me ___."`
  2. *For someone I love*: `"Lord, have mercy on ___."`
  3. *For the Church/world*: `"Lord, make Your house a house of prayer for ___."`
- **Weekly Practical Challenges (Section 5 — Choose One)**: (1) *Persistent Prayer* (daily for one suffering person); (2) *Humble Prayer* (begin each day with `"Lord, help me"`); (3) *Catholic Hospitality* (reach out to someone feeling like an outsider); (4) *Eucharistic Humility* (pray `"Lord, I am not worthy..."` slowly before Communion).
- **Next Week Announcement (Section 5)**: *"Faith that Endures" — James 1:2–4*.
- **Closing Prayer (Section 5 — 3 min)**:
  > Lord Jesus, Son of David, have mercy on us. When we feel like outsiders, draw us closer. When You seem silent, teach us to persevere. When we are proud, make us humble. When we are discouraged, strengthen our faith. When we are tempted to send others away, give us Your heart of mercy. Make Your Church a house of prayer for all peoples. Let all nations praise You. Heal those we carry in our hearts. And say over us, by Your grace: "Great is your faith." Amen.


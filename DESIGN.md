---
name: YA Bible Study — Sacred Midnight Sanctuary
description: Contemplative, full-screen midnight-and-gold liturgical interface with luminous violet/indigo/emerald accents, enlarged editorial serif & body typography, choreographed text reveals, and full-screen procedural Three.js PBR 3D animations for mobile-first live group study.
designAssets:
  sourceOfTruth:
    - path: ux/1. Welcome.png
      role: Welcome & Role Selection screen (use "Participant" instead of "Assistant"; unmounted completely once joined)
      authority: source_of_truth_with_overrides
    - path: ux/2. Leader Setup.png
      role: Study Leader PDF/MD upload & 6-section detection preview
      authority: source_of_truth_with_overrides
    - path: ux/3. Title - Leader.png
      role: Study Leader full-screen Lobby view (Participants see only the full-screen "The study leader will begin shortly" view)
      authority: source_of_truth_with_overrides
    - path: ux/4. Prayer - Leader waiting.png
      role: Section 1 Leader view (First-Hand-Wins status, Pick Randomly, Back/Next navigation, persistent QR share)
      authority: source_of_truth_with_overrides
    - path: ux/5. Prayer - Assistant.png
      role: Section 1 Participant view (First-Hand-Wins Raise Hand 3D orb & enlarged animated prayer text)
      authority: source_of_truth_with_overrides
    - path: ux/6. Prayer - Selected.png
      role: High-visibility "YOU WERE CHOSEN!" view with 3D golden aura, enlarged animated text & Done CTA
      authority: source_of_truth_with_overrides
    - path: ux/7. Ice Breaker - Leader.png
      role: Section 2 Leader view ("Outsiders Wanted", follow-up, Examples to Listen For, First-Hand-Wins / Pick Randomly)
      authority: source_of_truth_with_overrides
    - path: ux/8. Ice Breaker - Assistant.png
      role: Section 2 Participant view (warm gold Raise Hand orb & enlarged animated prompt)
      authority: source_of_truth_with_overrides
    - path: ux/7. Reading - Leader.png
      role: Section 3 Leader view (Gospel Reading, First-Hand-Wins / Pick Randomly trigger)
      authority: source_of_truth_with_overrides
    - path: ux/8. Reading - Assistant.png
      role: Section 3 Participant view (enlarged animated Gospel text card & Read aloud orb)
      authority: source_of_truth_with_overrides
    - path: ux/9. Randomizing.png
      role: Full-screen 3D Random Picker spin & automatic high-visibility winner reveal
      authority: source_of_truth_with_overrides
    - path: ux/10. Discussion - Leader.png
      role: Section 5 Leader view (active question queue, + Add, Next question; preceded by Section 4 Deep Analysis)
      authority: source_of_truth_with_overrides
    - path: ux/11. Discussion - Assistant.png
      role: Section 5 Participant view (active question, live Sharing feed, I want to respond)
      authority: source_of_truth_with_overrides
    - path: ux/12. Closing Prayer.png
      role: Section 6 Closing summary, Next Week announcement, enlarged animated Closing Prayer & Finish study CTA
      authority: source_of_truth_with_overrides
  generatedConcepts: []
colors:
  background: "#0B0D17"
  backgroundElevated: "#121526"
  surface: "#171B2E"
  surfaceHighlight: "#1F2442"
  borderSubtle: "rgba(255, 255, 255, 0.09)"
  borderGold: "rgba(226, 168, 62, 0.55)"
  primary: "#E2A83E"
  primaryHover: "#EEB852"
  primaryForeground: "#11131F"
  secondary: "#B855C8"
  accentIndigo: "#6E75F5"
  accentEmerald: "#10B981"
  accentTerracotta: "#9A4A38"
  text: "#F8FAFC"
  textMuted: "#CBD5E1"
  textSubtle: "#94A3B8"
typography:
  displaySerif:
    fontFamily: "'Playfair Display', 'Cormorant Garamond', Georgia, serif"
    fontSize: "2.625rem"
    fontWeight: 700
    lineHeight: 1.12
  h1:
    fontFamily: "'Playfair Display', Georgia, serif"
    fontSize: "2.25rem"
    fontWeight: 700
    lineHeight: 1.18
  h2:
    fontFamily: "'Playfair Display', Georgia, serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.3
  scriptureItalic:
    fontFamily: "'Playfair Display', Georgia, serif"
    fontSize: "1.3125rem"
    fontStyle: "italic"
    lineHeight: 1.65
  eyebrow:
    fontFamily: "'Plus Jakarta Sans', 'Inter', system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 600
    letterSpacing: "0.14em"
    textTransform: "uppercase"
  body:
    fontFamily: "'Plus Jakarta Sans', 'Inter', system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 400
    lineHeight: 1.6
rounded:
  sm: "12px"
  md: "18px"
  lg: "24px"
  pill: "9999px"
spacing:
  xs: "0.5rem"
  sm: "0.75rem"
  md: "1rem"
  lg: "1.5rem"
  xl: "2rem"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primaryForeground}"
    rounded: "{rounded.pill}"
    height: "56px"
    fontWeight: 700
  button-random:
    backgroundColor: "{colors.secondary}"
    textColor: "#FFFFFF"
    rounded: "{rounded.pill}"
    height: "54px"
    fontWeight: 700
  card-surface:
    backgroundColor: "{colors.surface}"
    border: "1px solid {colors.borderSubtle}"
    rounded: "{rounded.lg}"
motion:
  springTap:
    stiffness: 420
    damping: 26
    scalePressed: 0.96
  springMorph:
    stiffness: 280
    damping: 28
  sectionEntryDurationMs: 3200
  randomPickerSpinDurationMs: 3200
  sectionTransitionMs: 320
---

# Design Direction

## Overview

`YA Bible Study` pairs the reverence of evening candlelit liturgy with crisp, tactile modern mobile interaction for young adults in their 20s and 30s. Once a user joins a session, each screen occupies the **entire viewport (`100dvh`)** without leftover Welcome or Lobby clutter—anchoring attention on full-screen 3D section-entry animations, enlarged animated Scripture and study text, unmistakable volunteer reveals, and effortless leader pacing.

## Existing Design Assets & Authoritative Overrides

All 14 reference screens in `ux/*.png` serve as palette and component references, subject to the following **authoritative product overrides**:

1. **Terminology Override (`Participant`, never `Assistant`)**: Render `"Participant"` in all UI labels, badges, and dual-mode selectors.
2. **Exclusive Full-Screen Isolation Post-Join**:
   - Once a user joins (`lobby` or `in_progress`), completely unmount the Welcome hero header and stage-pill switcher card so the active view covers `100%` of the screen.
   - **Participant Waiting View (`lobby`)**: Before the study starts, `Participants` do **not** see the Lobby metrics card or Welcome screen; they see **only** a full-screen waiting view centered on a glowing 3D `Sacred3DScene` sanctuary emblem and the message *"The study leader will begin shortly"*.
   - **Study Leader Lobby View (`lobby`)**: The `Study Leader` sees a clean full-screen Lobby view with study overview, attendee count, `Share QR Code`, and `Start Study`.
3. **Full-Screen 3D Section Entry Animations (All 6 Sections)**:
   - Starting the study (`Start Study`) or entering any section (`Next Section` or `Previous Section`) triggers a multi-second (~3.2s) **full-screen 3D animation overlay** covering the entire viewport before revealing the section UI.
   - Every section has a **distinct 3D `Sacred3DScene` emblem**, color aura, section title (`Section X of 6`), and short description of the stage being entered:
     1. *Section 1 — Opening Prayer*: Luminous liturgical violet 3D Prayer Orb (`#B855C8`) — *"Entering Opening Prayer · Prepare our hearts in humility and mercy"*.
     2. *Section 2 — Icebreaker*: Warm amber/bronze interlocking 3D Hospitality Rings (`#E2A83E`) — *"Entering Icebreaker · Outsiders Wanted"*.
     3. *Section 3 — Gospel Reading*: Sanctuary indigo-periwinkle 3D Gospel Codex (`#6E75F5`) — *"Entering Gospel Reading · Proclamation of Matthew 15:21–28"*.
     4. *Section 4 — Deep Analysis*: Radiant emerald-and-gold 3D Sanctuary Lantern & Scroll Crystal (`#10B981` / `#E2A83E`) — *"Entering Deep Analysis · Verse-by-Verse Gospel Breakdown & Catholic Doctrine"*.
     5. *Section 5 — Discussion & Reflection*: Luminous rose-gold 3D Community Flame (`#E2A83E` / `#B855C8`) — *"Entering Discussion & Reflection · Lord, Help Me Pray"*.
     6. *Section 6 — Closing Prayer*: Golden 5-point 3D Star of Faith (`#E2A83E`) — *"Entering Closing Prayer · Sending Forth in Faith"*.
4. **First-Hand-Wins & Full-Screen 3D Random Picker**:
   - **First-Hand-Wins**: In Sections 1, 2, and 3, the first `Participant` to tap `Raise Hand` / `Read aloud` automatically wins the turn—no manual waiting queue required.
   - **Participant Full-Screen 3D Random Picker**: When nobody volunteers and the `Study Leader` clicks `Pick Randomly`, `Participants` see **only** the full-screen 3D spinning `Sacred3DScene` random-picker polyhedron (`#B855C8` / `#E2A83E`) for ~3.2 seconds until the person is chosen.
   - **High-Visibility Chosen Reveal**: Once a volunteer is selected (via First-Hand-Wins or Random Picker), **everyone** sees a clear, prominent 3D-accented announcement card showing who was chosen (`"<DisplayName> was chosen!"`), and the chosen `Participant` sees an unmistakable, high-contrast golden `"YOU WERE CHOSEN!"` screen with a radiant 3D emblem, enlarged animated reading/prayer text, and the exclusive `Done` CTA.
5. **Dedicated Section 4 (`Deep Analysis`) from Parsed PDF/MD**:
   - Present the parsed `.pdf` / `.md` **Deep Analysis** (`A–J` verse-by-verse commentary, `A–D` Catholic doctrine, `A–D` young adult application) as `Section 4 of 6` to **both** the `Study Leader` and `Participants`.
6. **Enlarged Typography & Animated Text Appearance**:
   - Increase font sizes across all sections (`scriptureItalic` at `1.3125rem` / `21px`, `body` at `1.125rem` / `18px`, `h2` at `1.5rem` / `24px`) so prayers, Scripture, Deep Analysis points, and questions are effortless to read aloud.
   - Reveal text in every section with smooth staggered animations (`motion/react` fade + upward slide + line/paragraph cadence).
7. **Leader Backward Navigation & Anytime QR Code Re-Share**:
   - Provide the `Study Leader` with a `Previous Section` (`← Back`) button on Sections 2–6 alongside `Next Section`, and a persistent `Share QR` button in the header across all screens so latecomers can scan and join at any time.

## Generated Concept Images

Not used; authoritative project mockups exist in `ux/1. Welcome.png` through `ux/12. Closing Prayer.png` with the overrides documented above.

## Product Feel

- **Mood**: Sacred, warm, unhurried, communal, and immersive (*"mercy, not pace, is the goal"*).
- **Lighting**: Deep midnight canvas (`#0B0D17`) illuminated by soft radial ambient glows (`blur(80px–120px)`) shifting per section across warm candle-gold (`#E2A83E`), liturgical violet (`#B855C8`), sanctuary indigo (`#6E75F5`), and emerald-gold (`#10B981`).

## Colors

- **Canvas & Surfaces**: Midnight `#0B0D17` base; `#171B2E` glass-slate cards; `#1F2442` highlighted prompt cards; `1px` subtle borders (`rgba(255,255,255,0.09)`), switching to warm gold border (`rgba(226,168,62,0.55)`) on active cards, chosen-volunteer banners, and upload dropzones.
- **Semantic Accents**:
  - **Sacred Gold (`#E2A83E`)**: Leader authority badges, `"YOU WERE CHOSEN!"` highlight aura, progress bar fill, and primary forward CTAs (`Start Study`, `Done`, `Next Section`, `Finish study`). Paired with dark ink `#11131F`.
  - **Liturgical Violet/Magenta (`#B855C8`)**: Prayer volunteering orb and `Pick Randomly` actions.
  - **Sanctuary Periwinkle (`#6E75F5`)**: Participant role badge and `Read aloud` Gospel orb.
  - **Live Emerald (`#10B981`)**: `● LIVE` session pill, `✓ Analyzed` file badge, and Section 4 `Deep Analysis` accent.

## Typography

- **Display & Section Headings**: High-contrast editorial serif (`Playfair Display`, fallback `Georgia, serif`). `2.625rem` display titles, `2.25rem` section headings, and `1.5rem` card titles.
- **Scripture, Prayers & Prompts (`scriptureItalic`)**: Enlarged italic serif (`1.3125rem` / `21px`, line-height `1.65`) on crisp `#F8FAFC` for effortless reading on mobile screens.
- **Body Copy, Deep Analysis & Questions (`body`)**: Enlarged geometric sans (`Plus Jakarta Sans` or `Inter`, `1.125rem` / `18px`, line-height `1.6`) with high-contrast `#F8FAFC` primary and `#CBD5E1` secondary text.
- **UI Controls & Eyebrows**: `0.8125rem` (`13px`), `600` weight, uppercase, `0.14em` tracking in Sacred Gold `#E2A83E`.

## Layout

- **Full-Screen Stage Isolation (`100dvh`)**: Every post-join screen (`Waiting View`, `Leader Lobby`, `Section Entry 3D Overlay`, `Random Picker 3D Overlay`, and `Study Sections 1–6`) occupies the full screen (`min-height: 100dvh`) without rendering the Welcome hero or stage-switcher above it.
- **Persistent Section Header (Sections 1–6)**: Top row showing `SECTION X OF 6` and progress bar (`17%..100%`), connection badge, and—for the `Study Leader`—the persistent **`Share QR`** button (plus a clean `Leave` option).
- **Sticky Bottom Action Zone**:
  - **Study Leader**: Paired `← Previous` (on Sections 2–6) and primary gold `Next Section →` / `Finish study` (or locked status pill with override when waiting on an uncompleted volunteer turn).
  - **Chosen Participant**: High-visibility golden `"YOU WERE CHOSEN!"` banner and `Done` / `Done Sharing` / `Done Reading` primary button.
- **Desktop Dual Side-by-Side Mode (`>= 1024px`)**: Top simulation toolbar above two side-by-side device frames (`Study Leader` on left, `Participant` on right) synchronized live via `/ws`.

## Motion, 3D Scenes & Animated Text

- **All Animations Include 3D (`Sacred3DScene`)**:
  - Every full-screen transition (Participant waiting screen, study start, each of the 6 section entries, random picker spin, and chosen-volunteer reveal) features an active 3D `Sacred3DScene` emblem with studio PBR lighting and motion impulses.
- **Animated Text Reveal (`motion/react`)**:
  - Section titles, prayers, icebreaker questions, Gospel verses, Deep Analysis cards (`A–J`), and discussion prompts animate into view with staggered paragraph/verse choreography (`opacity: 0 -> 1`, `y: 14 -> 0`) when the section opens.
- **Motion & 3D Safety**: Honor `prefers-reduced-motion: reduce` by shortening transition durations and replacing rapid 3D rotation with gentle static PBR lighting, and provide a 3D-styled SVG/CSS emblem fallback if WebGL context creation is unavailable.

## Core Screens

1. **Welcome & Role Selection** (`ux/1. Welcome.png`) — Shown **only** before joining a session.
2. **Load Your Study (Leader Setup)** (`ux/2. Leader Setup.png`) — Full-screen `.pdf`/`.md` upload or preloaded `"Great Is Your Faith"` setup with 6-section preview.
3. **Full-Screen Waiting View (Participant) & Full-Screen Lobby (Leader)** — Participants see **only** `"The study leader will begin shortly"` with a 3D sanctuary emblem; Leader sees the Lobby overview, `Share QR Code`, and `Start Study`.
4. **Full-Screen 3D Section Entry Overlay (Sections 1–6)** — Multi-second full-screen 3D animation announcing each section (`Section 1 of 6` through `Section 6 of 6`) and its description whenever entering forward or backward.
5. **Full-Screen 3D Random Picker & High-Visibility Winner Reveal** — Participants see **only** the 3D spinning random picker while selecting, followed by `"<Name> was chosen!"` for everyone and an unmistakable `"YOU WERE CHOSEN!"` view for the selected Participant.
6. **Section 1 of 6 — Opening Prayer** — Enlarged animated prayer text, First-Hand-Wins `Raise Hand` orb, `Pick Randomly`, and `Done` gate.
7. **Section 2 of 6 — Icebreaker** — Enlarged animated `"Outsiders Wanted"` prompts, leader notes, First-Hand-Wins / `Pick Randomly`, and `Done Sharing`.
8. **Section 3 of 6 — Gospel Reading** — Enlarged animated **Matthew 15:21–28** text, First-Hand-Wins `Read aloud` orb, `Pick Randomly`, and `Done Reading` gate.
9. **Section 4 of 6 — Deep Analysis** — Full-screen parsed Gospel breakdown (`A–J` verse-by-verse analysis, `A–D` Catholic doctrine, `A–D` young adult application) with animated text reveal for both Leader and Participants.
10. **Section 5 of 6 — Discussion & Reflection** — Curated active question queue + 12-question bank, live `Sharing` reflection feed, and `"Lord, Help Me"` `Prayer Card`.
11. **Section 6 of 6 — Closing Prayer** — 3D Star of Faith, session summary, weekly challenges, Next Week announcement, enlarged animated closing prayer, and `Finish study`.

## Do's and Don'ts

- **Do** unmount the Welcome screen and Lobby metrics once a Participant joins—show **only** `"The study leader will begin shortly"` in the lobby and **only** the active section (or full-screen 3D overlay) once the study starts.
- **Do** include a 3D `Sacred3DScene` visual in every waiting, section-entry, random-picker, and in-section animation.
- **Do** use enlarged typography (`>= 18px` body, `>= 21px` Scripture/prayers) with animated text entrance in every section.
- **Do** give the `Study Leader` a persistent `Share QR` control and `Previous Section` / `Next Section` controls.
- **Don't** use the label `"Assistant"` anywhere in the UI—always use `"Participant"`.
- **Don't** show other section UI to Participants while `Pick Randomly` is spinning—show **only** the full-screen 3D random picker until the person is chosen.

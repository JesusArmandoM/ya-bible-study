---
name: YA Bible Study — Sacred Midnight Sanctuary
description: Contemplative, high-contrast midnight-and-gold liturgical interface with luminous violet/indigo accents, editorial serif headings, and procedural Three.js PBR sacred emblems for mobile-first live group study.
designAssets:
  sourceOfTruth:
    - path: ux/1. Welcome.png
      role: Welcome & Role Selection screen (use "Participant" instead of "Assistant")
      authority: source_of_truth_with_overrides
    - path: ux/2. Leader Setup.png
      role: Study Leader PDF/MD upload & section detection preview
      authority: source_of_truth
    - path: ux/3. Title - Leader.png
      role: Live Session Title Lobby & metrics card
      authority: source_of_truth
    - path: ux/4. Prayer - Leader waiting.png
      role: Section 1 Leader view (raised hands queue, Pick Randomly, locked advance bar)
      authority: source_of_truth_with_overrides
    - path: ux/5. Prayer - Assistant.png
      role: Section 1 Participant view (Raise Hand interactive orb)
      authority: source_of_truth
    - path: ux/6. Prayer - Selected.png
      role: Exclusive chosen volunteer prayer view with Suggested Prayer & Done CTA
      authority: source_of_truth_with_overrides
    - path: ux/7. Ice Breaker - Leader.png
      role: Section 2 Leader view ("Outsiders Wanted", follow-up, Examples to Listen For)
      authority: source_of_truth
    - path: ux/8. Ice Breaker - Assistant.png
      role: Section 2 Participant view (warm gold Raise Hand orb & live count)
      authority: source_of_truth
    - path: ux/7. Reading - Leader.png
      role: Section 3 Leader view (Gospel Reading, reader selector, Random trigger)
      authority: source_of_truth_with_overrides
    - path: ux/8. Reading - Assistant.png
      role: Section 3 Participant view (Gospel text card & Read aloud orb)
      authority: source_of_truth_with_overrides
    - path: ux/9. Randomizing.png
      role: Random Selection result with 30s acceptance countdown, Retry & Confirm
      authority: source_of_truth_with_overrides
    - path: ux/10. Discussion - Leader.png
      role: Section 4 Leader view (active question queue, + Add, Next question)
      authority: source_of_truth
    - path: ux/11. Discussion - Assistant.png
      role: Section 4 Participant view (active question, live Sharing feed, I want to respond)
      authority: source_of_truth
    - path: ux/12. Closing Prayer.png
      role: Section 5 Closing summary, Next Week announcement & Finish study CTA
      authority: source_of_truth
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
  textMuted: "#94A3B8"
  textSubtle: "#64748B"
typography:
  displaySerif:
    fontFamily: "'Playfair Display', 'Cormorant Garamond', Georgia, serif"
    fontSize: "2.375rem"
    fontWeight: 700
    lineHeight: 1.12
  h1:
    fontFamily: "'Playfair Display', Georgia, serif"
    fontSize: "2rem"
    fontWeight: 700
    lineHeight: 1.18
  h2:
    fontFamily: "'Playfair Display', Georgia, serif"
    fontSize: "1.35rem"
    fontWeight: 600
    lineHeight: 1.3
  scriptureItalic:
    fontFamily: "'Playfair Display', Georgia, serif"
    fontSize: "1.0625rem"
    fontStyle: "italic"
    lineHeight: 1.55
  eyebrow:
    fontFamily: "'Plus Jakarta Sans', 'Inter', system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    letterSpacing: "0.14em"
    textTransform: "uppercase"
  body:
    fontFamily: "'Plus Jakarta Sans', 'Inter', system-ui, sans-serif"
    fontSize: "0.95rem"
    fontWeight: 400
    lineHeight: 1.5
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
  sectionTransitionMs: 320
---

# Design Direction

## Overview

`YA Bible Study` pairs the reverence of evening candlelit liturgy with crisp, tactile modern mobile interaction for young adults in their 20s and 30s. Every screen anchors attention on a single liturgical moment—progress bar at top, glowing 3D emblem or editorial serif prompt in the center, contextual community activity below, and one unmistakable primary action at the bottom.

## Existing Design Assets

All 14 reference screens live in `ux/*.png` at the repository root and serve as **authoritative layout, palette, and flow references**, subject to four explicit overrides agreed during discovery:

1. **Terminology Override (`Participant`, never `Assistant`)**: Where `ux/1. Welcome.png` (and filenames) say `"Assistant"`, render `"Participant"` in all UI labels, badges, and dual-mode selectors.
2. **Gospel-Only Main Reading in Section 3**: Follow `ux/7. Reading - Leader.png` and `ux/8. Reading - Assistant.png` in presenting **only the Gospel Reading** (e.g., *Matthew 15:21–28*) as the main reading, while making the full Gospel text cleanly scrollable inside the Scripture card so the chosen reader can proclaim the complete passage aloud. Replace the locked footer hint *"select another passage after this one"* with *"Waiting for reader to finish to advance"*.
3. **Interactive Three.js `Sacred3DScene` Hero Stage**: Upgrade the static central icon badges/circles in the PNGs into real-time Three.js PBR 3D scenes (`Sacred3DScene`) matching each stage's color glow:
   - *Welcome & Title Lobby*: Golden 4-point sanctuary emblem (`#E2A83E`).
   - *Section 1 Opening Prayer*: Luminous liturgical violet prayer orb (`#B855C8`), transitioning to a radiant golden chalice/microphone aura on `"YOU WERE CHOSEN"`.
   - *Section 2 Icebreaker*: Warm bronze/amber hospitality rings (`#E2A83E`).
   - *Section 3 Gospel Reading*: Indigo-periwinkle Gospel codex (`#6E75F5`).
   - *Random Selection*: Faceted violet-gold polyhedron (`#B855C8` / `#E2A83E`) spinning during selection and settling on the candidate.
   - *Section 5 Closing Prayer*: Golden 5-point Star of Faith (`#E2A83E`).
4. **Fix Static-Export Artifacts**: Center two-letter initials cleanly inside circular avatars (fixing top-left clipping seen in `ux/4`, `ux/7`, `ux/9`, `ux/11`), give status pills sufficient horizontal padding so labels (`YOU WERE CHOSEN`, `RANDOM SELECTION`) never overflow borders, and stack Section 3's Scripture card above the `Read aloud` orb with proper spacing so they never overlap (`ux/8. Reading - Assistant.png`).

## Generated Concept Images

Not used; authoritative project mockups already exist in `ux/1. Welcome.png` through `ux/12. Closing Prayer.png`.

## Product Feel

- **Mood**: Sacred, warm, unhurried, communal, and tactile (*"mercy, not pace, is the goal"*).
- **Lighting**: Deep midnight canvas (`#0B0D17`) illuminated by soft radial ambient glows (`blur(80px–120px)`) in warm candle-gold (`rgba(226, 168, 62, 0.18)`), liturgical violet (`rgba(184, 85, 200, 0.20)`), or sanctuary indigo (`rgba(110, 117, 245, 0.18)`), shifting subtly per section.

## Colors

- **Canvas & Surfaces**: Midnight `#0B0D17` base; `#171B2E` glass-slate cards; `#1F2442` highlighted prompt cards (`Icebreaker` question card); `1px` subtle borders (`rgba(255,255,255,0.09)`), switching to warm gold border (`rgba(226,168,62,0.55)`) on active cards and upload dropzones.
- **Semantic Accents**:
  - **Sacred Gold (`#E2A83E`)**: Leader authority badges, progress bar fill, primary forward CTAs (`Continue`, `Start Study`, `Done`, `Begin Reading`, `Confirm selection`, `Next question`, `I want to respond`, `Finish study`). Always paired with dark ink `#11131F` for high contrast.
  - **Liturgical Violet/Magenta (`#B855C8`)**: Prayer volunteering orb and `Pick Randomly` / `Random` actions.
  - **Sanctuary Periwinkle (`#6E75F5`)**: Participant role badge and `Read aloud` Gospel orb.
  - **Live Emerald (`#10B981`)**: `● LIVE` session pill, `✓ Analyzed` file badge, and active hand-raised dot.
  - **Alert Terracotta (`#9A4A38` surface tint / `#E07A5F` icon)**: 30-second countdown notification card in `Random Selection`.

## Typography

- **Display & Section Headings**: High-contrast editorial serif (`Playfair Display` loaded via Google Fonts or bundled self-hosted webfont, fallback `Georgia, serif`). Used for screen titles, Scripture quotes, and chosen participant names.
- **UI, Controls & Eyebrows**: Clean geometric sans (`Plus Jakarta Sans` or `Inter`). Eyebrows (`SECTION 1 OF 5`, `MOMENT`, `DEEP ANALYSIS · 25 MIN`, `CHOOSE YOUR ROLE`) use `0.75rem`, `600` weight, uppercase, `0.12em–0.15em` tracking in Sacred Gold `#E2A83E`.
- **Scripture & Prayer Text**: Italic serif (`1rem–1.1rem`, line-height `1.55–1.65`) on `#F8FAFC` / `#E2E8F0` for effortless oral reading on mobile screens.

## Layout

- **Mobile Single-Column Frame**: Max content width `440px` centered on mobile/tablet portrait, padded `20px–24px` horizontally, respecting `env(safe-area-inset-top)` and `env(safe-area-inset-bottom)` on iOS Safari.
- **Persistent Section Header (Sections 1–5)**: Top row showing `SECTION X OF 5` (or `QUESTION X OF Y`) on the left, percentage (`20%..100%`) on the right, and a `4px` rounded gold progress bar directly beneath, plus unobtrusive connection/session code chip.
- **Sticky/Anchored Bottom Action Zone**: Primary CTA or locked status pill (`🔒 Waiting for volunteer to advance` / `ⓘ Only the leader decides when to advance`) anchored cleanly at the bottom without obscuring scrollable content.
- **Desktop Dual Side-by-Side Mode (`>= 1024px`)**: Top simulation toolbar (Room Code, Dual Mode toggle, active `Participant` switcher dropdown + `+ Simulate Participant`) above two side-by-side `390px x 844px` device frames (`Study Leader` on left, `Participant` on right) synchronized live via `/ws`.

## Shapes

- Generous pill buttons (`border-radius: 9999px`, `54px–56px` touch height).
- Soft rounded cards (`20px–24px` radius) and rounded-square icon containers (`16px–22px` radius).
- Concentric double-ring circular touch orbs (`180px–220px` diameter) for `Raise Hand` and `Read aloud` with gentle pulse animation when raised.

## Components

1. **Role Selection Cards (`Welcome`)**: Icon badge + serif title (`Study Leader` / `Participant`) + muted 2-line caption + chevron; room code / PIN sheet slides up smoothly on tap.
2. **Study Upload Dropzone & Preview Card (`Leader Setup`)**: Gold-glow dropzone accepting `.pdf` and `.md`, paired with analyzed file card (`✓ Analyzed`, section count, detected structure summary) and room code/QR share preview.
3. **Sacred3DScene Stage (`@react-three/fiber` + `@react-three/drei`)**: Persistent single-canvas WebGL hero (`140px–220px` height depending on screen density) with studio PBR lighting, finger/pointer drag tilt inertia, smooth cross-stage morphing, and 60fps `zustand`-driven reaction impulses on user clicks.
4. **Volunteer Queue & Roster Strip**: Avatar circles (properly centered 2-letter initials on gold/violet/emerald gradients), relative timestamp (`Raised 4s ago`), per-row gold `Choose` pill, and avatar quick-pick strip in Section 3.
5. **Scripture & Pastoral Drawer/Tabs**: Scrollable Gospel card in Section 3; expandable Leader Pastoral Notes & 12-Question Bank drawer + Participant `"Lord, Help Me"` 3-part `Prayer Card` modal/sheet in Section 4.

## Motion, Micro-Interactions & 3D Reactivity

- **Tactile Button & Orb Clicks (`0ms` Optimistic Feedback)**:
  - Every interactive pill (`Start Study`, `Choose`, `Pick Randomly`, `Done`, `Next question`, `I want to respond`, `Finish study`) uses spring press compression (`scale: 0.96`, `stiffness: 420, damping: 26`), a subtle specular highlight sweep across gold buttons, and progressive haptic feedback (`navigator.vibrate(12)` where supported).
  - Tapping the circular `Raise Hand` or `Read aloud` orb emits expanding concentric aura rings and immediately switches to an active pulsing state while syncing over `/ws`.
- **Action-Coupled 3D Impulses (`zustand` -> `Sacred3DScene`)**:
  - **Hand Raised / Read Aloud**: Emits a luminous shockwave ring, temporary emissive bloom boost, and gentle rotational impulse on the 3D prayer orb or Gospel codex.
  - **Random Selection (`Pick Randomly` / `Retry`)**: Accelerates the 3D faceted polyhedron with physics damping before settling onto the selected participant; tapping `Confirm selection` triggers a warm Sacred Gold (`#E2A83E`) light flare.
  - **Volunteer Completion (`Done` / `Done Reading`)**: Radiates a synchronized golden completion pulse on both the volunteer's screen and the `Study Leader` screen as advancement unlocks.
- **Choreographed State & List Transitions (`motion/react`)**:
  - Live raised-hand rows and Section 4 `Sharing` reflections enter/exit with `AnimatePresence` + `layout` spring motion rather than abrupt DOM jumps.
  - When a chosen volunteer taps `Done`, the Leader's bottom locked bar (`🔒 Waiting for volunteer to advance`) morphs smoothly into the active Sacred Gold CTA.
  - Ambient background radial glows crossfade smoothly between gold, liturgical violet, and sanctuary indigo as sections advance.

## Core Screens

1. **Welcome & Role Selection** (`ux/1. Welcome.png`) — Choose `Study Leader`, `Participant` (enter room code + name), or Desktop `Dual Side-by-Side Mode`.
2. **Load Your Study** (`ux/2. Leader Setup.png`) — Drag/select `.pdf`/`.md` or use pre-analyzed `"Great Is Your Faith.pdf"`.
3. **Title Lobby** (`ux/3. Title - Leader.png`) — Live attendee counter, Room Code / QR share modal trigger, study metrics, `Sacred3DScene` sanctuary emblem, leader-only `Start Study`.
4. **Section 1 — Opening Prayer** (`ux/4`, `ux/5`, `ux/6`) — Leader queue + `Pick Randomly`; Participant violet `Raise Hand` orb; Chosen Participant golden `"It's your turn to pray"` + suggested prayer + `Done`.
5. **Section 2 — Icebreaker** (`ux/7 Ice Breaker`, `ux/8 Ice Breaker`) — `"Outsiders Wanted"` card + follow-up + leader `"Examples to Listen For"`; Participant bronze `Tap to raise your hand` orb.
6. **Section 3 — Gospel Reading & Random Selection** (`ux/7 Reading`, `ux/8 Reading`, `ux/9 Randomizing`) — Full Matthew 15:21–28 Gospel card, `Sacred3DScene` codex, `Read aloud` orb, `Random Selection` 30s countdown (`Retry` / `Confirm selection`), and chosen reader `Done Reading` view.
7. **Section 4 — Deep Analysis & Prayer Card** (`ux/10`, `ux/11`) — `"Lord, Help Me Pray"` active question queue, leader pastoral notes & 12-question bank, live `Sharing` reflection feed (`I want to respond` with anonymous option), and `"Lord, Help Me"` `Prayer Card` builder/download.
8. **Section 5 — Closing Prayer** (`ux/12. Closing Prayer.png`) — `Sacred3DScene` Star of Faith, session metrics, weekly challenges, `"Faith that Endures" — James 1:2–4` announcement, closing prayer text, and `Finish study`.

## Responsive Baseline

- **Mobile First (`360px–480px`)**: Full-bleed vertical flex layout using `100dvh` (`min-height: 100dvh`) with scrollable middle region so long Scripture passages, reflection lists, and 12-question drawers never clip or collide with bottom CTAs. All `<input>` and `<textarea>` controls must use `font-size >= 16px` (`1rem`) so iOS Safari never auto-zooms the page on focus.
- **Tablet / Single-Role Desktop (`481px–1023px` or single-role mode)**: Centered `440px` sanctuary column over the ambient midnight background.
- **Desktop Dual Mode (`>= 1024px`)**: Side-by-side Leader and Participant frames with zero horizontal overflow.

## Accessibility Baseline

- **Contrast**: Gold primary buttons (`#E2A83E`) must use dark `#11131F` text (`>= 8:1` contrast); body copy `#F8FAFC` and `#94A3B8` on `#0B0D17` / `#171B2E` meet WCAG AA.
- **Touch Targets**: All interactive pills, orbs, and `Choose` buttons minimum `44px x 44px`.
- **Motion & 3D Safety**: Honor `prefers-reduced-motion: reduce` by disabling rapid spinning/pulsing in `Sacred3DScene` and rendering gentle static PBR lighting or SVG emblem fallback when WebGL context creation fails.
- **Live Announcements**: Announce `"You were chosen"`, active section transitions, and random-selection countdowns via `aria-live="polite"`.

## Do's and Don'ts

- **Do** keep one primary gold action at the bottom of each Leader screen and clearly show a locked/info state to Participants so leader-controlled pacing is unmistakable.
- **Do** make the full Gospel text and Opening/Closing prayers readable without truncation on small `375px` screens.
- **Don't** use the label `"Assistant"` anywhere in the UI—always use `"Participant"`.
- **Don't** add multi-reading tabs (Isaiah/Psalm/Romans) to Section 3's reading turn—keep Section 3 focused solely on the **Gospel Reading**.
- **Don't** let 3D scenes overpower text legibility or block main-thread scroll/touch responsiveness on mobile browsers.

## Open Design Questions

- None blocking implementation; exact procedural mesh silhouettes for the 5 `Sacred3DScene` variants can be refined during implementation while preserving the stage colors and layout footprint above.

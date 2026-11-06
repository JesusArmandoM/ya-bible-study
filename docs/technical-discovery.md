# Technical Discovery

## Product Surface

- **Primary Surface**: Mobile-first responsive Single-Page Web Application (SPA) optimized for iOS Safari (`iPhone`) and Android Chrome (`360px–430px` portrait viewports), with full desktop support and exclusive full-screen stage isolation once a user joins a session.
- **Secondary Surface**: Desktop `Dual Side-by-Side Mode` (`>= 1024px`) rendering two synchronized mobile-frame viewports (`Study Leader` + `Participant` with member switcher) connected over the same `/ws` backend.

## Candidate Stack

- **Language**: TypeScript end-to-end (shared domain & WebSocket message schemas between client and server).
- **Frontend & State Bridge**:
  - React 18/19 + Vite + CSS custom properties / Tailwind CSS aligned to `DESIGN.md` tokens + Lucide icons.
  - **`zustand`**: Authoritative client store synchronized with `/ws` **plus** a transient `60fps` impulse channel (`store.getState()` read directly inside Three.js `useFrame` without triggering React component re-renders) and `0ms` optimistic UI press/toggle feedback prior to server ack.
- **UI Motion, Animated Text & Full-Screen Overlays**:
  - **`motion` (`motion/react`)**:
    - Full-screen `AnimatePresence` transitions for the multi-second **Section Entry 3D Animation** (`sectionEnteredAt`) whenever entering any of the 6 sections (forward or backward).
    - Full-screen **3D Random Picker** screen (`random_spinning`) for Participants that hides all other section UI while the 3D picker spins, followed by a choreographed high-visibility reveal of the chosen Participant.
    - Staggered/choreographed animated text reveal (`opacity`, `y`, `blur`) for prayers, icebreaker prompts, Gospel verses, Deep Analysis cards, and discussion questions, paired with enlarged typography tokens.
    - Spring-physics button/orb press feedback (`whileTap`, expanding concentric ripples, specular light sweeps) and smooth locked-pill-to-gold-CTA morphing when a volunteer taps `Done`.
  - **Progressive Haptics**: `navigator.vibrate(12)` tactile ticks on supported mobile browsers (Android Chrome) paired with synchronous visual pulse feedback for iOS Safari.
- **3D Rendering (`Sacred3DScene`)**:
  - **`three` + `@react-three/fiber` + `@react-three/drei`**: Procedural sacred geometries with studio PBR lighting (`Environment` / `Lightformer`, physical/emissive materials—no heavy external `.glb` downloads).
  - **Persistent Single-Canvas Architecture**: Each active viewport mounts **one persistent WebGL `<Canvas>`** across the session rather than destroying/recreating contexts per section—smoothly adapting its camera/size and procedural 3D emblem across:
    1. Participant Waiting View (*"The study leader will begin shortly"*),
    2. Full-Screen 3D Section Entry Overlays (for each of the 6 sections),
    3. Full-Screen 3D Random Picker (`random_spinning`),
    4. High-visibility `"YOU WERE CHOSEN!"` golden aura reveal, and
    5. Active in-section 3D stage headers.
    Includes automatic `prefers-reduced-motion` and non-WebGL CSS/SVG 3D-styled emblem fallback.
- **Backend & Real-Time**: Node.js HTTP server (Express or Fastify) + native `ws` library mounted on `/ws` serving both REST upload/parse endpoints and real-time session rooms from a single process/port.
- **Deterministic Document Parsing (6 Sections)**:
  - `.md` & `.pdf`: Structured heading/section parser (`remark` / regex AST walker + `pdf-parse`) recognizing the standard 17-section Catholic Bible study format and mapping it deterministically into the **6 interactive `StudySections`**, including extracting **Section 8 (`Deep Analysis A–J`)**, **Section 9 (`Catholic Doctrine A–D`)**, and **Section 10 (`Application A–D`)** into `section_4_deep_analysis` for both `Study Leader` and `Participants`.
- **Client Export**: HTML5 Canvas / `html-to-image` export for downloading the Participant's `"Lord, Help Me"` `Prayer Card` locally on iOS/Android.

## Data and Storage

- **Live Session Store**: In-memory server `Map<sessionCode, LiveSession>` with periodic TTL cleanup (4 hours of inactivity or explicit room close). No external database (PostgreSQL/Redis) required for MVP.
- **Preloaded Seed Study**: Bundled TypeScript/Markdown module containing the complete *"Great Is Your Faith"* (Matthew 15:21–28) 6-section curriculum, including full Matthew 15:21–28 Gospel text, Opening & Closing Prayers, Icebreaker, `A–J` Deep Analysis, Catholic Doctrine `A–D`, Young Adult Application `A–D`, all 12 Reflection Questions with sample answers & leader notes, Prayer Card template, and Weekly Practical Challenges.
- **Shared Deep Analysis Broadcast**: Unlike facilitator-only pastoral notes (sample reflection answers in Section 5), the parsed `deepAnalysis` payload (`A–J` verse breakdown, `A–D` Catholic doctrine, `A–D` application) is included in the sanitized session study payload so both `Study Leader` and `Participants` render Section 4 (`Deep Analysis`).
- **Client Persistence**: `sessionStorage` / `localStorage` limited strictly to reconnect credentials (`sessionCode`, `memberId`, `leaderToken` if leader) and the Participant's private `PrayerCard` draft during the session.

## Integrations

- **Anytime QR Code & Public Join URL Resolution**: Local client-side QR rendering (`qrcode` library) accessible from a persistent `Share QR` control on the `Study Leader` header across both `lobby` and all 6 `in_progress` sections. Automatically prefers a configured or detected `PUBLIC_URL` (or prompts the leader to use the active HTTPS tunnel URL) so latecomers on cellular/external networks never scan an unreachable `localhost` link.
- **Public HTTPS Tunnel for Cross-Network Local Runs**: First-class compatibility with **Cloudflare Quick Tunnels (`cloudflared tunnel --url http://localhost:<port>`)** via `npm run share`, exposing the local server over `https://` + `wss://`.
- **External APIs**: None required.

## Authentication and Authorization

- **Session-Scoped Capabilities**: Every `/ws` command envelope includes `sessionCode`, `memberId`, and (for leader actions) `leaderToken`.
- **Server-Side Enforcement**:
  - The `/ws` message handler validates `leaderToken` before executing `load_study`, `start_study`, `next_section`, `previous_section`, `pick_random`, `reset_turn`, `override_turn`, `set_active_question`, `add_question`, or `finish_study`.
  - **First-Hand-Wins Enforcement**: When a `Participant` sends `raise_hand` during `volunteerTurn.status === 'collecting_hands'` in Sections 1, 2, or 3, the server atomically assigns `selectedMemberId = memberId`, sets `selectionMethod = 'first_hand'`, and transitions `status` to `'assigned'`.
  - **Automatic Random Selection Resolution**: When the `Study Leader` sends `pick_random`, the server selects a random eligible connected `Participant`, broadcasts `status: 'random_spinning'` (with `randomSpinEndsAt`), and automatically transitions to `status: 'assigned'` when the spin window completes (emitting a synchronized `/ws` snapshot so all clients reveal the chosen `Participant` simultaneously).
  - Validates `memberId === volunteerTurn.selectedMemberId` before accepting `complete_turn` (`Done` / `Done Sharing` / `Done Reading`).

## Deployment and Operations

- **Unified Single-Origin / Single-Port Serving**: Both production (`npm start`) and dev (`npm run dev` with Vite proxy `ws: true` and `allowedHosts: true`) expose UI, `/api/*`, and `/ws` through **one single port/origin**, and the client resolves `(location.protocol === 'https:' ? 'wss:' : 'ws:') + '//' + location.host + '/ws'` dynamically.
- **Operational Ownership**: Self-operated by the study organizer / developer on a single instance.

## Testing and Verification

- **Unit Tests (`Vitest`)**:
  - Deterministic 6-section `.md` and `.pdf` study parser tests verifying accurate extraction of `section_4_deep_analysis` (`A–J` commentary, `A–D` doctrine, `A–D` application) on *"Great Is Your Faith"* and a second study fixture.
  - Pure state-machine tests for `LiveSession` and `VolunteerTurn` verifying First-Hand-Wins immediate assignment, `pick_random` spinning-to-assigned resolution, bidirectional `next_section` / `previous_section` transitions, and `completedSectionIds` unlock preservation.
- **Integration Tests**: WebSocket `/ws` server tests verifying role authorization (rejecting `Participant` attempts to call `next_section` or `previous_section`, verifying First-Hand-Wins race handling, and verifying `pick_random` broadcast).
- **End-to-End Browser Tests (`Playwright`)**: Multi-page mobile viewport tests verifying full-screen post-join isolation (Participants see only *"The study leader will begin shortly"*), full-screen 3D section entry animations across all 6 sections, backward navigation, First-Hand-Wins, full-screen 3D random picker for Participants, high-visibility `"YOU WERE CHOSEN!"` reveal, Section 4 `Deep Analysis` rendering, animated larger text, and anytime Leader QR re-share.

## Observability

- **Structured Server Logs**: JSON/structured console logs for session lifecycle events (`session_created`, `study_parsed`, `member_joined`, `section_advanced`, `section_rewound`, `volunteer_selected`, `ws_error`) excluding personal reflection text and private prayer content.
- **Health Endpoint**: `GET /api/health` reporting server uptime, active session count, and WebSocket readiness.
- **Client Connection Indicator**: Compact connection status & Leader QR trigger in the top section bar.

## Constraints

- **Mobile GPU & 60fps Budget**: `Sacred3DScene` reuses `1` persistent WebGL `<Canvas>` per viewport (`<= 2` total in Desktop `Dual Side-by-Side Mode`), caps `dpr={[1, 2]}`, pauses rendering when document visibility is hidden, and handles `webglcontextlost` / `webglcontextrestored` with an automatic SVG/CSS 3D-styled emblem fallback.
- **iOS & Android 90-Minute Session Hardening**:
  - Acquire **Screen Wake Lock API** (`navigator.wakeLock.request('screen')`) during active sessions.
  - Trigger immediate `/ws` health check / reconnect + full session snapshot hydration on `document.visibilitychange` (`visible`) and `online` events.
  - Enforce `font-size >= 16px` (`1rem`) on all `<input>` and `<textarea>` elements and use `100dvh` full-screen layouts.
- **File Upload Safety**: Limit `.pdf` / `.md` uploads to `<= 10 MB`, validate MIME/extension, and parse in memory.

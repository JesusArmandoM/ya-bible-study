# Technical Discovery

## Product Surface

- **Primary Surface**: Mobile-first responsive Single-Page Web Application (SPA) optimized for iOS Safari (`iPhone`) and Android Chrome (`360px–430px` portrait viewports), with full desktop support.
- **Secondary Surface**: Desktop `Dual Side-by-Side Mode` (`>= 1024px`) rendering two synchronized mobile-frame viewports (`Study Leader` + `Participant` with member switcher) connected over the same `/ws` backend.

## Candidate Stack

- **Language**: TypeScript end-to-end (shared domain & WebSocket message schemas between client and server).
- **Frontend & State Bridge**:
  - React 18/19 + Vite + CSS custom properties / Tailwind CSS aligned to `DESIGN.md` tokens + Lucide icons.
  - **`zustand`**: Authoritative client store synchronized with `/ws` **plus** a transient `60fps` impulse channel (`store.getState()` read directly inside Three.js `useFrame` without triggering React component re-renders) and `0ms` optimistic UI press/toggle feedback prior to server ack.
- **UI Motion & Micro-Interactions**:
  - **`motion` (`motion/react`)**: Spring-physics button/orb press feedback (`whileTap`, expanding concentric ripples, specular light sweeps), `AnimatePresence` + `layout` choreography for live raised-hand queues and reflection cards, smooth locked-pill-to-gold-CTA morphing when a volunteer taps `Done`, and staged section transitions.
  - **Progressive Haptics**: `navigator.vibrate(12)` tactile ticks on supported mobile browsers (Android Chrome) paired with synchronous visual pulse feedback for iOS Safari.
- **3D Rendering (`Sacred3DScene`)**:
  - **`three` + `@react-three/fiber` + `@react-three/drei`**: Procedural sacred geometries with studio PBR lighting (`Environment` / `Lightformer`, physical/emissive materials—no heavy external `.glb` downloads).
  - **Persistent Single-Canvas Architecture**: Each active viewport mounts **one persistent WebGL `<Canvas>`** across the session rather than destroying/recreating contexts per section—eliminating shader-compile frame hitches on mobile, smoothly morphing meshes/lights across stages, supporting direct touch/pointer tilt inertia, and reacting physically to user actions (`Raise Hand` pulse, `Pick Randomly` physics spin, `Confirm selection` / `Done` golden light burst). Includes automatic `prefers-reduced-motion` and non-WebGL CSS/SVG fallback.
- **Backend & Real-Time**: Node.js HTTP server (Express or Fastify) + native `ws` library mounted on `/ws` serving both REST upload/parse endpoints and real-time session rooms from a single process/port.
- **Deterministic Document Parsing**:
  - `.md`: Structured heading/section parser (`remark` / regex AST walker) recognizing the standard 17-section Catholic Bible study format.
  - `.pdf`: Deterministic text extraction (`pdf-parse` / `pdfjs-dist` on Node or browser) normalizing headings and line breaks into the identical structured parser pipeline—zero external AI/LLM APIs.
- **Client Export**: HTML5 Canvas / `html-to-image` export for downloading the Participant's `"Lord, Help Me"` `Prayer Card` locally on iOS/Android.

## Data and Storage

- **Live Session Store**: In-memory server `Map<sessionCode, LiveSession>` with periodic TTL cleanup (4 hours of inactivity or explicit room close). No external database (PostgreSQL/Redis) required for MVP.
- **Preloaded Seed Study**: Bundled TypeScript/Markdown module containing the complete *"Great Is Your Faith"* (Matthew 15:21–28) curriculum, including full Matthew 15:21–28 Gospel text, Opening & Closing Prayers, Icebreaker, A–J Deep Analysis, Catholic Doctrine A–D, all 12 Reflection Questions with sample answers & leader notes, Prayer Card template, and Weekly Practical Challenges.
- **Client Persistence**: `sessionStorage` / `localStorage` limited strictly to reconnect credentials (`sessionCode`, `memberId`, `leaderToken` if leader) and the Participant's private `PrayerCard` draft during the session.

## Integrations

- **QR Code & Public Join URL Resolution**: Local client-side QR rendering (`qrcode` library). When the `Study Leader` views the app via `localhost` / `127.0.0.1`, the QR/share sheet automatically prefers a configured or detected `PUBLIC_URL` (or prompts the leader to use the active HTTPS tunnel URL) so mobile devices on cellular/external networks never scan an unreachable `localhost` link.
- **Public HTTPS Tunnel for Cross-Network Local Runs**: First-class compatibility with **Cloudflare Quick Tunnels (`cloudflared tunnel --url http://localhost:<port>`)** or `ngrok` via a convenience script (`npm run share`), exposing the local server over `https://` + `wss://` to iOS/Android phones on 4G/5G or separate Wi-Fi networks with zero cloud hosting cost.
- **External APIs**: None required.

## Authentication and Authorization

- **Session-Scoped Capabilities**: Every `/ws` command envelope includes `sessionCode`, `memberId`, and (for leader actions) `leaderToken`.
- **Server-Side Enforcement**: The `/ws` message handler validates `leaderToken` before executing `load_study`, `start_study`, `choose_volunteer`, `pick_random`, `confirm_random`, `retry_random`, `override_turn`, `set_active_question`, `add_question`, `next_section`, or `finish_study`, and validates `memberId === volunteerTurn.selectedMemberId` before accepting `complete_turn` (`Done` / `Done Reading`).

## Deployment and Operations

- **Unified Single-Origin / Single-Port Serving**: Both production (`npm start`) and dev (`npm run dev` with Vite proxy `ws: true` and `allowedHosts: true`) expose UI, `/api/*`, and `/ws` through **one single port/origin**, and the client resolves `(location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws'` dynamically—never hardcoding `ws://localhost`.
- **Deployment Target**: Runnable directly on the `Study Leader`'s laptop bridged to external mobile networks via HTTPS tunnel (`cloudflared` / `ngrok`), **or** deployable as a single stateful Node.js service to **Railway**, **Render**, or **Fly.io**.
- **Operational Ownership**: Self-operated by the study organizer / developer on a single instance (sticky in-memory state requires `1` replica for MVP rather than stateless horizontal scaling).

## Testing and Verification

- **Unit Tests (`Vitest`)**:
  - Deterministic `.md` and `.pdf` study parser tests verifying accurate extraction on *"Great Is Your Faith"* and a second distinct study following the same structural template.
  - Pure state-machine tests for `LiveSession` and `VolunteerTurn` (including hand-raising, 30s `Random Selection` countdown/retry/confirm, exclusive `Done` unlocking, and leader disconnect override).
- **Integration Tests**: WebSocket `/ws` server tests verifying role authorization (rejecting `Participant` attempts to advance sections or spoof another user's `Done` action).
- **End-to-End Browser Tests (`Playwright`)**: Multi-page mobile viewport tests walking through Welcome -> Load Your Study -> Title -> Opening Prayer -> Icebreaker -> Gospel Reading -> Deep Analysis & Prayer Card -> Closing Prayer, plus Desktop `Dual Side-by-Side Mode`.

## Observability

- **Structured Server Logs**: JSON/structured console logs for session lifecycle events (`session_created`, `study_parsed`, `member_joined`, `section_advanced`, `volunteer_selected`, `ws_error`) excluding personal reflection text and private prayer content.
- **Health Endpoint**: `GET /api/health` reporting server uptime, active session count, and WebSocket readiness for hosting platform health checks.
- **Client Connection Indicator**: Visible `LIVE` / reconnecting badge in the top bar so leader and participants immediately see WebSocket health.

## Constraints

- **Mobile GPU & 60fps Budget**: `Sacred3DScene` reuses `1` persistent WebGL `<Canvas>` per viewport (`<= 2` total in Desktop `Dual Side-by-Side Mode`), caps `dpr={[1, 2]}`, pauses rendering when document visibility is hidden, handles `webglcontextlost` / `webglcontextrestored` on iOS WebKit with automatic SVG/CSS emblem fallback, and reads transient interaction impulses via `zustand` inside `useFrame` without React re-renders. UI animations in `motion` must animate GPU-composited properties (`transform`, `opacity`) so mobile scrolling and button taps stay at `60fps`.
- **iOS & Android 90-Minute Session Hardening**:
  - Acquire **Screen Wake Lock API** (`navigator.wakeLock.request('screen')`) during active sessions (re-requesting on `visibilitychange`, ignoring gracefully if unsupported) so phones do not auto-lock mid-prayer or mid-reading.
  - Trigger immediate `/ws` health check / reconnect + full session snapshot hydration on `document.visibilitychange` (`visible`) and `online` events after background app switches or phone lock.
  - Enforce `font-size >= 16px` (`1rem`) on all `<input>` and `<textarea>` elements and use `100dvh` safe-area layouts to prevent iOS Safari forced viewport auto-zoom when typing.
- **File Upload Safety**: Limit `.pdf` / `.md` uploads to `<= 10 MB`, validate MIME/extension, parse in memory without persisting uploaded files to public disk, and return actionable validation messages if required sections (e.g., Opening Prayer or Gospel Reading) cannot be detected.

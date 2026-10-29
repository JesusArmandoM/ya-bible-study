# Operational Constraints

Future specifications, implementations, and validations MUST obey these repository-wide invariants:

1. **Unified Origin & Dynamic `ws(s)://` Resolution**:
   - Browser code MUST resolve `/api/*` via relative same-origin paths and compute WebSocket URLs dynamically from `window.location` (`wss:` on `https:`, `ws:` on `http:`) via `src/client/lib/runtimeUrl.ts`.
   - Browser code and QR share payloads MUST NOT hardcode `localhost` or `127.0.0.1` when accessed over a LAN IP or public HTTPS tunnel.
2. **Tunnel-Friendly Host Handling**:
   - `vite.config.ts` MUST keep `server.allowedHosts: true` and `preview.allowedHosts: true`, and `src/server/` MUST NOT block unfamiliar `Host` headers so Cloudflare Quick Tunnels (`npm run share`) and `ngrok` work without reconfiguration.
3. **Role Terminology (`Participant`, Never `Assistant`)**:
   - All English UI copy, accessible labels, shared types, and tests MUST use `Study Leader` and `Participant`.
   - Implementations MUST NOT display `"Assistant"` (even where static `ux/*.png` mockups show `"Assistant"`).
4. **Gospel-Only Main Reading in Section 3**:
   - Section 3 (`Gospel Reading`) MUST present **only** the Gospel passage (e.g., *Matthew 15:21–28*) for the interactive reading turn—MUST NOT render multi-reading Mass tabs (Old Testament / Psalm / Epistle) in the reading flow.
5. **Server-Side Role & Turn Gating**:
   - The `/ws` server MUST enforce `leaderToken` checks on every leader-exclusive command (`open_lobby`, `load_study`, `start_study`, volunteer selection/randomization/override, active question switching, section advancement, `finish_study`, `close_session`) and MUST verify `memberId === volunteerTurn.selectedMemberId` before accepting `Done` / `Done Reading`. Client-only button hiding is insufficient.
   - `leaderPin`, `leaderToken`, and per-member `reconnectToken` secrets MUST NEVER appear in `PublicLiveSessionSnapshot`, `PublicSessionMember`, or public broadcasts (`roster_updated`, `session_updated`), and `WebSocketServer` MUST enforce an explicit `maxPayload` cap (`64 KiB` default).
6. **Ephemeral Privacy & Local Prayer Cards**:
   - Personal `"Lord, Help Me"` `PrayerCard` drafts MUST stay local to the `Participant`'s browser unless the user explicitly shares a single line, and server-held `LiveReflections` MUST remain ephemeral in memory and be purged on session completion or 4-hour inactivity TTL.
7. **Mobile iOS/Android Ergonomics (`>= 16px` Inputs & `100dvh`)**:
   - All `<input>`, `<textarea>`, and `<select>` elements MUST maintain computed `font-size >= 16px` (`1rem`) to prevent iOS Safari forced viewport auto-zoom, inside `100dvh` safe-area layouts with `>= 44px` touch targets.
8. **Persistent Single-Canvas 3D Budget**:
   - `Sacred3DScene` MUST mount at most `1` persistent WebGL `<Canvas>` per active viewport (`<= 2` in Desktop Dual Side-by-Side Mode), cap `dpr` at `2`, honor `prefers-reduced-motion: reduce`, and render an automatic SVG/CSS fallback when WebGL is unavailable or lost.
9. **Deterministic In-Memory Study Parsing (Zero External AI)**:
   - `.md` and `.pdf` uploads MUST be capped at `<= 10 MB`, parsed deterministically in memory without writing uploaded files to public disk, and MUST NOT call external AI/LLM APIs.
10. **Non-Blocking `./init.sh` Gate**:
    - `./init.sh` MUST remain a synchronous, non-blocking verification gate (`typecheck`, `test`, `build`) and MUST NOT start blocking long-lived servers (`npm run dev` or `npm start`).

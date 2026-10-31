# Risks and Open Questions

## Blocking Next Phase

None. Product scope, domain language (`Participant`, `Gospel Reading`), access control, deterministic `.pdf`/`.md` ingestion, ephemeral privacy rules, TypeScript + `/ws` + Three.js architecture, and `DESIGN.md` visual references (`ux/*.png`) are confirmed.

## Implementation-Time Questions

1. **Uploaded PDF Gospel Text Completeness (`Implementation-time`)**: Notice that study outlines like *"Great Is Your Faith"* sometimes list only `*Key lines:*` under Section 6 while quoting individual verses across Section 8 (`A–J`). When a newly uploaded `.pdf` or `.md` omits the continuous verbatim Gospel paragraph block, should the parser stitch quoted verses from the Deep Analysis headers (`A–J`) as a fallback or prompt the `Study Leader` to paste/confirm the Gospel passage during setup? *(Initial stance: support full Gospel text inside Section 6 when present, reconstruct verse blocks from Section 8 headers when omitted, and let the Leader preview/edit the Gospel text before starting.)*
2. **Leader PIN Display & Recovery (`Resolved in ws-live-session-room-lifecycle`)**: Auto-generates a zero-padded 4-digit `leaderPin` alongside an unambiguous 6-character uppercase `sessionCode` and private `leaderToken` on `create_session`; entering the valid `leaderPin` via `claim_leader` rotates `leaderToken` and revokes the displaced leader socket.
3. **Prayer Card Export Format on Mobile (`Implementation-time`)**: On iOS Safari, `<a download>` on canvas PNG data URLs opens a preview tab or share sheet (`navigator.share` with File) rather than silent download. *(Initial stance: use Web Share API `navigator.share({ files })` on mobile when supported, falling back to PNG download.)*

## Later / Not MVP

- **Multi-room persistent parish dashboard (`Later`)**: Storing historical session attendance metrics across an entire liturgical year.
- **Built-in Bible API lookup (`Later`)**: Auto-fetching full USCCB NABRE Gospel text by verse citation alone when an uploaded PDF includes only `"Matthew 15:21–28"`.
- **Horizontal multi-instance scaling (`Later`)**: Moving in-memory `/ws` room state to Redis pub/sub or Cloudflare Durable Objects if dozens of parishes run concurrent rooms on one deployment.

## Assumptions

- Weekly study `.pdf` files uploaded by the `Study Leader` are text-based PDFs (selectable text, not scanned photographs requiring OCR) and follow the numbered section conventions of *"Great Is Your Faith"*.
- During in-person or hybrid meetings, participants speak prayers, icebreaker reflections, and the Gospel reading aloud in the room (or external call), so the web app coordinates **turn-taking, Scripture text, and live text reflections** rather than streaming microphone audio.
- A single stateful Node.js instance easily supports typical parish young adult groups (`5–50` concurrent WebSocket connections per session).

## Risks

| Risk | Impact | Mitigation |
| :--- | :--- | :--- |
| **Chosen volunteer locks phone or loses mobile signal mid-turn** | Session advancement could stall if strictly gated on `Done` | Provide `Study Leader` with a secondary `"Reassign / Mark Done (Override)"` safeguard while keeping primary advancement locked during normal flow. |
| **PDF text extraction quirks (ligatures, page headers/footers, line wraps)** | Section boundaries in uploaded `.pdf` files could misalign | Normalize whitespace/page numbers before heading detection, support `.md` uploads directly, and show detected section counts + preview in `Load Your Study` before session start. |
| **Three.js WebGL context loss or battery drain on older phones** | Blank hero area or sluggish scrolling on mobile browsers | Cap DPR at `2`, use lightweight procedural PBR meshes, pause rendering when hidden, and provide an automatic CSS/SVG sacred emblem fallback. |
| **iOS Safari background tab suspension** | Brief WebSocket disconnect when a participant checks another app | **Mitigated by `mobile-wake-lock-foreground-resync`** (2026-10-31): `useScreenWakeLock` acquires `navigator.wakeLock` (silent degradation where unsupported/denied) and `useForegroundResync` triggers instant `/ws` `reconnect_session` snapshot re-hydration on `visibilitychange` + `online` + focus with a ~5s `isConnected()` watchdog, surfacing a `Reconnecting…` chip and returning to Welcome on definitive session-gone errors. |
| **Localhost server unreachable across cellular/separate Wi-Fi** | Phones on 4G/5G fail to open `localhost` or plain `ws://` | Serve UI + `/api` + `/ws` on a single port with `allowedHosts: true` and dynamic `wss://`, expose via HTTPS tunnel (`cloudflared` / `npm run share`), and guard QR generation against `localhost` URLs. |

## Research Tasks

- Verify `pdf-parse` vs `pdfjs-dist` bundle/Node compatibility in the chosen TypeScript monorepo/server setup so `.pdf` uploads parse cleanly in local dev and container deployments without native OS binary dependencies.

# User and Access Model

## User Types

- **Facilitator (`Study Leader`)**: Parish young adult leader or peer host running the session on mobile, tablet, or desktop.
- **Attendee (`Participant`)**: Young adult Bible study attendee joining on iOS Safari, Android Chrome, or desktop browser without creating an account.
- **Desktop Demo / Tester Operator**: Single user running `Dual Side-by-Side Mode` to preview and test both roles simultaneously.

## Roles

| Role | Cardinality per `LiveSession` | Identity Mechanism |
| :--- | :--- | :--- |
| `Study Leader` | Exactly `1` active controller | Ephemeral `leaderToken` issued on room creation or claimed via 4-digit `leaderPin` |
| `Participant` | `0..N` connected attendees | `sessionCode` (or QR join URL) + self-entered `displayName` + session-scoped `memberId` |

## Permissions

| Capability | `Study Leader` | Chosen `Participant` (Active Turn) | Regular `Participant` |
| :--- | :---: | :---: | :---: |
| Upload `.pdf` / `.md` or select preloaded `StudyDocument` | Yes | No | No |
| Start study (`Start Study`) & advance `Study Sections` | **Yes (Exclusive)** | No | No |
| View `Pastoral Leader Notes`, sample answers & full question bank | **Yes (Exclusive)** | No | No |
| Choose volunteer, run `Random Selection`, `Retry`, `Confirm selection` | **Yes (Exclusive)** | No | No |
| Emergency override / reassign stalled `VolunteerTurn` | **Yes (Exclusive)** | No | No |
| Activate `Next question` or `+ Add` prompt in Section 4 | **Yes (Exclusive)** | No | No |
| `Raise Hand` / `Read aloud` during open volunteer collection | No | N/A | Yes |
| View `"YOU WERE CHOSEN"` prompt & tap `Done` / `Done Reading` | No | **Yes (Exclusive)** | No |
| Submit `LiveReflection` (named or anonymous) in Section 4 | Optional | Yes | Yes |
| Create & download personal `"Lord, Help Me"` `PrayerCard` | Optional | Yes | Yes |

## Ownership Boundaries

- **Session & Pacing State**: Owned exclusively by the `Study Leader` and enforced server-side over `/ws` (client UI hiding alone is insufficient; the WebSocket server rejects unauthorized state-advance commands from `Participant` connections).
- **Personal `PrayerCard`**: Owned exclusively by the creating `Participant` in browser storage/memory; never transmitted to the server unless the participant explicitly chooses to share **one** selected line with the group.
- **`LiveReflections`**: Ephemeral to the active `LiveSession`; visible to connected session members during Section 4 and purged when the session closes or expires.

## Access Rules

1. **Frictionless Participant Join**: Entering a valid `sessionCode` (or scanning the lobby QR URL) plus a non-empty `displayName` grants `Participant` access immediately—no email, password, or third-party login required.
2. **Single Active Leader Lock**: Creating a `LiveSession` binds leadership to an HTTP/WebSocket `leaderToken` stored in `sessionStorage` and displays a short 4-digit `leaderPin` to the leader. Another device cannot join as `Study Leader` for that `sessionCode` unless the leader enters the `leaderPin` to transfer control.
3. **Dual Side-by-Side Mode Isolation**: Launching Dual Mode spins up an isolated sandbox/demo `LiveSession` (with pre-populated sample participants such as *Mary Lopez*, *Daniel Reyes*, and *Sara Castillo*) so testing never collides with an active group's live room.

## Revocation / Expiry

- **Volunteer Turn Revocation**: If a chosen `Participant` disconnects, declines, or lets the 30-second `Random Selection` window lapse without confirmation, the `Study Leader` can `Retry` or reassign, immediately revoking `selectedMemberId` from the prior participant.
- **Leader Handoff**: Entering the valid `leaderPin` from a new device transfers the active `leaderToken` and downgrades or disconnects the stale leader socket.
- **Session Expiry & Data Purge**: Closing the study (`Finish study` -> close room) or 4 hours of room inactivity terminates the `LiveSession` in memory and permanently deletes all ephemeral `LiveReflections`, raised-hand history, and member rosters. Locally downloaded `PrayerCards` remain on each participant's own device.

## Edge Cases

- **Duplicate Display Names**: Two participants named `"Daniel"` can join simultaneously; each receives a unique `memberId` and distinct disambiguated badge/avatar color if initials collide.
- **Accidental Role Tap on Welcome Screen**: If an attendee accidentally taps `Study Leader` on `1. Welcome`, they cannot hijack an existing room without its `leaderPin`, and can return to `Participant` join in one tap.

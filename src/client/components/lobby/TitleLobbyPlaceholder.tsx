import type { StudyDocument } from '../../../shared/study';

export interface TitleLobbyPlaceholderProps {
  study: StudyDocument | null;
  connectedMemberCount: number;
}

/**
 * Minimal Title Lobby handoff surface rendered while the session is in
 * `lobby` status after `open_lobby`. Explicitly provisional: QR/room-code
 * sharing, the attendee share sheet, and `Start Study` gating arrive with
 * `title-lobby-qr-join-start`.
 */
export function TitleLobbyPlaceholder({
  study,
  connectedMemberCount,
}: TitleLobbyPlaceholderProps) {
  return (
    <section
      className="title-lobby-placeholder"
      data-testid="title-lobby-placeholder"
      aria-label="Title Lobby"
    >
      <span className="title-lobby-eyebrow">STEP 2 OF 2 · TITLE LOBBY</span>

      <h2 className="title-lobby-title">{study ? study.title : 'Title Lobby'}</h2>

      {study && <p className="title-lobby-citation">{study.gospelCitation}</p>}

      <p
        className="title-lobby-count"
        data-testid="title-lobby-connected-count"
      >
        {connectedMemberCount}{' '}
        {connectedMemberCount === 1 ? 'member' : 'members'} connected
      </p>

      <p className="title-lobby-note">
        QR sharing and Start Study arrive with the full Title Lobby experience.
      </p>
    </section>
  );
}

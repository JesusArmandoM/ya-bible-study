import { useState, type FormEvent } from 'react';
import { motion } from 'motion/react';
import type { DualParticipant } from '../../lib/dualSessionSandbox';
import { usePrefersReducedMotion } from '../../lib/usePrefersReducedMotion';

export interface SimulationToolbarProps {
  sessionCode: string | null;
  leaderPin: string | null;
  participants: DualParticipant[];
  activeParticipantId: string | null;
  onSelectParticipant: (memberId: string) => void;
  onAddParticipant: (displayName: string) => Promise<unknown>;
  onExit: () => void;
}

export function SimulationToolbar({
  sessionCode,
  leaderPin,
  participants,
  activeParticipantId,
  onSelectParticipant,
  onAddParticipant,
  onExit,
}: SimulationToolbarProps) {
  const reducedMotion = usePrefersReducedMotion();
  const [copyFeedback, setCopyFeedback] = useState<boolean>(false);
  const [isAddOpen, setIsAddOpen] = useState<boolean>(false);
  const [newParticipantName, setNewParticipantName] = useState<string>('');
  const [isAdding, setIsAdding] = useState<boolean>(false);

  const handleCopyCode = async () => {
    if (!sessionCode) return;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(sessionCode);
      }
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 2000);
    } catch {
      // Best-effort copy
    }
  };

  const handleAddSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = newParticipantName.trim();
    if (!trimmed || isAdding) return;

    setIsAdding(true);
    try {
      await onAddParticipant(trimmed);
      setNewParticipantName('');
      setIsAddOpen(false);
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <header className="simulation-toolbar" data-testid="simulation-toolbar">
      <div className="simulation-toolbar-left">
        <div className="rehearsal-badge" data-testid="rehearsal-badge">
          <span className="rehearsal-badge-dot" aria-hidden="true" />
          <span className="rehearsal-badge-text">DESKTOP REHEARSAL MODE</span>
        </div>

        {sessionCode && (
          <div className="session-code-pill" data-testid="dual-session-code-pill">
            <span className="session-code-label">ROOM:</span>
            <span className="session-code-value" data-testid="dual-session-code">
              {sessionCode}
            </span>
            <motion.button
              type="button"
              className="session-code-copy-btn"
              data-testid="dual-copy-code-btn"
              aria-label="Copy session code"
              whileTap={reducedMotion ? undefined : { scale: 0.92 }}
              onClick={handleCopyCode}
            >
              {copyFeedback ? '✓ Copied' : '📋 Copy'}
            </motion.button>
          </div>
        )}
      </div>

      <div className="simulation-toolbar-center">
        <div
          className="participant-switcher-group"
          data-testid="participant-switcher"
          role="tablist"
          aria-label="Switch active participant in right frame"
        >
          <span className="switcher-label">PARTICIPANT:</span>
          {participants.map((p) => {
            const isActive = p.memberId === activeParticipantId;
            const slug = p.displayName.toLowerCase().replace(/\s+/g, '-');
            return (
              <button
                key={p.memberId}
                type="button"
                role="tab"
                aria-selected={isActive}
                data-active={isActive ? 'true' : 'false'}
                data-testid={`participant-tab-${slug}`}
                className={`participant-switcher-tab ${isActive ? 'active' : ''}`}
                onClick={() => onSelectParticipant(p.memberId)}
              >
                <span
                  className={`tab-avatar-dot palette-${p.avatarPalette}`}
                  aria-hidden="true"
                >
                  {p.initials}
                </span>
                <span className="tab-name">{p.displayName}</span>
              </button>
            );
          })}

          {!isAddOpen ? (
            <motion.button
              type="button"
              className="add-participant-trigger-btn"
              data-testid="add-participant-btn"
              whileTap={reducedMotion ? undefined : { scale: 0.95 }}
              onClick={() => setIsAddOpen(true)}
            >
              + Add Participant
            </motion.button>
          ) : (
            <form
              className="add-participant-inline-form"
              data-testid="add-participant-form"
              onSubmit={handleAddSubmit}
            >
              <input
                type="text"
                className="add-participant-input"
                data-testid="add-participant-input"
                placeholder="Name (e.g. David Kim)"
                value={newParticipantName}
                onChange={(e) => setNewParticipantName(e.target.value)}
                autoFocus
                disabled={isAdding}
                maxLength={40}
              />
              <button
                type="submit"
                className="add-participant-submit-btn"
                data-testid="add-participant-submit"
                disabled={!newParticipantName.trim() || isAdding}
              >
                {isAdding ? '...' : 'Add'}
              </button>
              <button
                type="button"
                className="add-participant-cancel-btn"
                data-testid="add-participant-cancel"
                onClick={() => {
                  setIsAddOpen(false);
                  setNewParticipantName('');
                }}
              >
                ✕
              </button>
            </form>
          )}
        </div>
      </div>

      <div className="simulation-toolbar-right">
        <motion.button
          type="button"
          className="dual-mode-exit-btn"
          data-testid="dual-mode-exit-btn"
          whileTap={reducedMotion ? undefined : { scale: 0.95 }}
          onClick={onExit}
        >
          Exit Rehearsal
        </motion.button>
      </div>
    </header>
  );
}

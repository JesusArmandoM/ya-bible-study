import { motion } from 'motion/react';
import type { SessionReflection } from '../../../shared/session';
import { usePrefersReducedMotion } from '../../lib/usePrefersReducedMotion';

export interface ReflectionCardProps {
  reflection: SessionReflection;
}

export function formatRelativeTime(isoString: string, nowMs = Date.now()): string {
  const time = Date.parse(isoString);
  if (!Number.isFinite(time)) {
    return 'Just now';
  }
  const diffSec = Math.max(0, Math.floor((nowMs - time) / 1000));
  if (diffSec < 10) {
    return 'Just now';
  }
  if (diffSec < 60) {
    return `${diffSec}s ago`;
  }
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) {
    return `${diffMin}m ago`;
  }
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

export function ReflectionCard({ reflection }: ReflectionCardProps) {
  const reducedMotion = usePrefersReducedMotion();

  const isAnonymous = reflection.isAnonymous;
  const avatarClass = isAnonymous
    ? 'reflection-avatar avatar-anonymous'
    : `reflection-avatar avatar-palette-${reflection.avatarPalette}`;

  return (
    <motion.article
      className={`reflection-card ${isAnonymous ? 'is-anonymous' : ''}`}
      data-testid={`reflection-card-${reflection.id}`}
      data-reflection-id={reflection.id}
      initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.98 }}
      animate={reducedMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
      exit={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
      layout
      transition={
        reducedMotion
          ? { duration: 0 }
          : { type: 'spring', stiffness: 350, damping: 28 }
      }
    >
      <div className="reflection-card-header">
        <div
          className={avatarClass}
          data-testid="reflection-avatar"
          aria-hidden="true"
        >
          <span className="reflection-initials" data-testid="reflection-initials">
            {reflection.authorInitials}
          </span>
        </div>

        <div className="reflection-meta">
          <span className="reflection-author" data-testid="reflection-author">
            {reflection.authorDisplayName}
          </span>
          <span className="reflection-timestamp" data-testid="reflection-timestamp">
            {formatRelativeTime(reflection.createdAt)}
          </span>
        </div>
      </div>

      <p className="reflection-content" data-testid="reflection-content">
        {reflection.content}
      </p>
    </motion.article>
  );
}

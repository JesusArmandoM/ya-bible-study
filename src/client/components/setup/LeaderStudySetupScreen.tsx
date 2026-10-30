import { motion } from 'motion/react';
import type { StudyDocument } from '../../../shared/study';
import { usePrefersReducedMotion } from '../../lib/usePrefersReducedMotion';
import type { StudySetupStatus } from '../../lib/useStudySetup';
import { StudyPreviewCard } from './StudyPreviewCard';
import { StudyStructureList } from './StudyStructureList';
import { StudyUploadDropzone } from './StudyUploadDropzone';

export interface LeaderStudySetupScreenProps {
  study: StudyDocument | null;
  status: StudySetupStatus;
  errorMessages: string[];
  onFileSelected: (file: File) => void;
  onContinue: () => void;
  onBack: () => void;
  /** `File.size` of the last uploaded study (chip hidden for the default). */
  uploadedFileSize?: number | null;
  /** Leader command failure surfaced from `useLiveSession`. */
  actionErrorMessage?: string | null;
  /** True while the `Continue` leader command is in flight. */
  isContinuing?: boolean;
}

function triggerTactileHaptic(reducedMotion: boolean): void {
  if (reducedMotion || typeof navigator === 'undefined') {
    return;
  }
  if (typeof navigator.vibrate === 'function') {
    try {
      navigator.vibrate(12);
    } catch {
      // Ignore unsupported or restricted vibration calls.
    }
  }
}

function AlertIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

const STATUS_MESSAGES: Record<StudySetupStatus, string> = {
  loading: 'Loading the preloaded study…',
  uploading: 'Analyzing your study file…',
  ready: 'Study analyzed and ready to confirm.',
  error: 'Study analysis needs your attention.',
};

/**
 * Load Your Study setup screen (`ux/2. Leader Setup.png`, `Setup · STEP 1 OF 2`)
 * for the Study Leader: gold-glow upload dropzone, analyzed study preview with
 * the 5-section structure (Gospel-only Section 3), and the gold `Continue` CTA
 * that opens the Title Lobby.
 */
export function LeaderStudySetupScreen({
  study,
  status,
  errorMessages,
  onFileSelected,
  onContinue,
  onBack,
  uploadedFileSize = null,
  actionErrorMessage = null,
  isContinuing = false,
}: LeaderStudySetupScreenProps) {
  const reducedMotion = usePrefersReducedMotion();
  const alertMessages = actionErrorMessage
    ? [...errorMessages, actionErrorMessage]
    : errorMessages;
  const isContinueDisabled = status !== 'ready' || isContinuing;

  return (
    <section
      className="study-setup-screen"
      data-testid="study-setup-screen"
      aria-label="Load Your Study setup"
    >
      <div className="study-setup-header">
        <button
          type="button"
          className="study-setup-back-button"
          data-testid="study-setup-back"
          aria-label="Back to session view"
          onClick={() => {
            triggerTactileHaptic(reducedMotion);
            onBack();
          }}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            focusable="false"
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>

        <div className="study-setup-heading">
          <h2 className="study-setup-title">Setup</h2>
          <span className="study-setup-eyebrow">STEP 1 OF 2</span>
        </div>

        <span className="study-setup-step-pill" aria-label="Setup step 1 of 2">
          1/2
        </span>
      </div>

      <div className="study-setup-intro">
        <h3 className="study-setup-hero">Load Your Study</h3>
        <p className="study-setup-subtitle">
          Upload the PDF or Markdown file with your Bible study structure.
        </p>
      </div>

      <StudyUploadDropzone onFileSelected={onFileSelected} />

      {alertMessages.length > 0 && (
        <div
          className="sheet-error-alert study-setup-alert"
          data-testid="study-setup-alert"
          role="alert"
        >
          <AlertIcon />
          <ul className="study-setup-alert-list">
            {alertMessages.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </div>
      )}

      <div
        className="study-setup-status"
        data-testid="study-setup-status"
        aria-live="polite"
      >
        {STATUS_MESSAGES[status]}
      </div>

      {study && (
        <div className="study-preview" data-testid="study-preview">
          <span className="study-preview-eyebrow">PREVIEW</span>
          <StudyPreviewCard study={study} uploadedFileSize={uploadedFileSize} />
          <StudyStructureList study={study} />
        </div>
      )}

      <motion.button
        type="button"
        className="study-setup-cta"
        data-testid="study-setup-continue"
        disabled={isContinueDisabled}
        whileTap={reducedMotion || isContinueDisabled ? undefined : { scale: 0.96 }}
        transition={{ type: 'spring', stiffness: 420, damping: 26 }}
        onClick={() => {
          triggerTactileHaptic(reducedMotion);
          onContinue();
        }}
      >
        {isContinuing ? 'Opening Lobby…' : 'Continue →'}
      </motion.button>
    </section>
  );
}

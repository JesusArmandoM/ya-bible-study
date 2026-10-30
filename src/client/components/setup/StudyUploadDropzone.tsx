import { motion } from 'motion/react';
import { useRef, useState, type DragEvent, type KeyboardEvent } from 'react';
import { usePrefersReducedMotion } from '../../lib/usePrefersReducedMotion';

export interface StudyUploadDropzoneProps {
  onFileSelected: (file: File) => void;
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

function CloudUploadIcon() {
  return (
    <svg
      width="30"
      height="30"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M12 13v8" />
      <path d="m8 17 4-4 4 4" />
      <path d="M20.88 18.09A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.29" />
    </svg>
  );
}

/**
 * Gold-glow drag-and-tap study file dropzone (`ux/2. Leader Setup.png`).
 * Accepts `.pdf` and `.md` study files (documented mockup adjustment) via tap,
 * keyboard (Enter/Space on the button), or HTML5 drag-and-drop.
 */
export function StudyUploadDropzone({ onFileSelected }: StudyUploadDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const reducedMotion = usePrefersReducedMotion();

  const emitFile = (file: File | undefined | null) => {
    if (!file) {
      return;
    }
    triggerTactileHaptic(reducedMotion);
    onFileSelected(file);
  };

  const handleDrop = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setIsDragging(false);
    emitFile(event.dataTransfer?.files?.[0]);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
      event.preventDefault();
      inputRef.current?.click();
    }
  };

  return (
    <div className="study-upload-zone">
      <motion.button
        type="button"
        className="study-upload-dropzone"
        data-testid="study-upload-dropzone"
        data-dragging={isDragging ? 'true' : 'false'}
        whileTap={reducedMotion ? undefined : { scale: 0.96 }}
        transition={{ type: 'spring', stiffness: 420, damping: 26 }}
        onClick={() => {
          triggerTactileHaptic(reducedMotion);
          inputRef.current?.click();
        }}
        onKeyDown={handleKeyDown}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        aria-label="Add a study file: drag a PDF or Markdown file here, or tap to select"
      >
        <span className="study-upload-icon" aria-hidden="true">
          <CloudUploadIcon />
        </span>
        <span className="study-upload-title">Drag study file here</span>
        <span className="study-upload-hint">or tap to select</span>
        <span className="study-upload-pill">PDF or MD files</span>
      </motion.button>

      <input
        ref={inputRef}
        type="file"
        className="study-file-input"
        data-testid="study-file-input"
        accept=".pdf,.md,application/pdf,text/markdown"
        aria-label="Study file (PDF or Markdown)"
        onChange={(event) => {
          const file = event.target.files?.[0];
          emitFile(file);
          // Allow re-selecting the same file after a failed analysis.
          event.target.value = '';
        }}
      />
    </div>
  );
}

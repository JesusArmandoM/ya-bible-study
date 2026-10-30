import { motion } from 'motion/react';
import type { StudyDocument } from '../../../shared/study';
import { usePrefersReducedMotion } from '../../lib/usePrefersReducedMotion';

export interface StudyPreviewCardProps {
  study: StudyDocument;
  /** `File.size` of the uploaded study; omitted for the preloaded default. */
  uploadedFileSize?: number | null;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const kilobytes = bytes / 1024;
  if (kilobytes < 1024) {
    return `${Math.round(kilobytes)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function resolveFileBadge(fileName: string, sourceType: string): string {
  if (sourceType === 'preloaded') {
    return 'PDF';
  }
  return fileName.trim().toLowerCase().endsWith('.md') ? 'MD' : 'PDF';
}

function FileLinesIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="8" y1="13" x2="15" y2="13" />
      <line x1="8" y1="17" x2="15" y2="17" />
    </svg>
  );
}

function DetectionListIcon() {
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
      <line x1="9" y1="6" x2="20" y2="6" />
      <line x1="9" y1="12" x2="20" y2="12" />
      <line x1="9" y1="18" x2="20" y2="18" />
      <circle cx="4.5" cy="6" r="1" fill="currentColor" />
      <circle cx="4.5" cy="12" r="1" fill="currentColor" />
      <circle cx="4.5" cy="18" r="1" fill="currentColor" />
    </svg>
  );
}

/**
 * Analyzed study preview: file card (`source.fileName`, `✓ Analyzed`, section
 * and question meta, optional upload size chip) plus the section-detection
 * summary card (`detectionSummary`). Renders no pastoral/facilitator fields.
 */
export function StudyPreviewCard({
  study,
  uploadedFileSize = null,
}: StudyPreviewCardProps) {
  const reducedMotion = usePrefersReducedMotion();
  const { source, detectionSummary } = study;
  const fileBadge = resolveFileBadge(source.fileName, source.type);
  const sizeLabel =
    typeof uploadedFileSize === 'number' ? formatFileSize(uploadedFileSize) : null;

  return (
    <motion.div
      className="study-preview-card"
      data-testid="study-preview-card"
      key={study.id}
      initial={reducedMotion ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 280, damping: 28 }}
    >
      <div className="study-preview-file-row">
        <div className="study-file-badge" aria-hidden="true">
          <FileLinesIcon />
          <span>{fileBadge}</span>
        </div>

        <div className="study-file-info">
          <span className="study-file-name">{source.fileName}</span>
          <span className="study-file-title">{study.title}</span>
          <div className="study-file-meta">
            <span className="study-analyzed-pill" data-testid="study-analyzed-pill">
              ✓ {source.statusLabel}
            </span>
            <span className="study-file-summary">
              5 sections · {detectionSummary.totalQuestionCount} questions
            </span>
            {sizeLabel !== null && (
              <span className="study-file-size" data-testid="study-file-size">
                {sizeLabel}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="study-detection-card" data-testid="study-detection-summary">
        <span className="study-detection-icon" aria-hidden="true">
          <DetectionListIcon />
        </span>
        <div className="study-detection-info">
          <span className="study-detection-title">
            {detectionSummary.sectionsDetectedLabel}
          </span>
          <span className="study-detection-label">{detectionSummary.detectedLabel}</span>
        </div>
      </div>
    </motion.div>
  );
}

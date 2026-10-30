import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { usePrefersReducedMotion } from '../../lib/usePrefersReducedMotion';
import { renderJoinQrSvg } from '../../lib/qrCode';

export interface RoomCodeShareSheetProps {
  open: boolean;
  sessionCode: string;
  /** Resolved localhost-safe join URL (already `PUBLIC_URL`-aware). */
  joinUrl: string;
  /** True when the current origin is localhost/127.0.0.1/[::1]. */
  isLocalOnly: boolean;
  /** True when `PUBLIC_URL` was used to build `joinUrl`. */
  usedPublicUrl: boolean;
  onClose: () => void;
}

const COPY_IDLE = '';
const COPY_SUCCESS = 'Link copied';

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

function supportsNativeShare(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof (navigator as { share?: unknown }).share === 'function'
  );
}

/**
 * Bottom sheet (opened from the Title Lobby share trigger) with a
 * client-side, offline-generated QR SVG encoding the join URL, the large
 * room code, a readonly join-URL field with `Copy`, `navigator.share` where
 * supported, and a terracotta warning pill when the link is local-only.
 */
export function RoomCodeShareSheet({
  open,
  sessionCode,
  joinUrl,
  isLocalOnly,
  usedPublicUrl,
  onClose,
}: RoomCodeShareSheetProps) {
  const reducedMotion = usePrefersReducedMotion();
  const [qrSvg, setQrSvg] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<string>(COPY_IDLE);
  const joinUrlRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    let isCancelled = false;
    setQrSvg(null);
    setCopyStatus(COPY_IDLE);

    void renderJoinQrSvg(joinUrl).then((svg) => {
      if (!isCancelled) {
        setQrSvg(svg);
      }
    });

    return () => {
      isCancelled = true;
    };
  }, [open, joinUrl]);

  const showLocalWarning = isLocalOnly && !usedPublicUrl;

  /** Selection + execCommand fallback for non-secure (LAN HTTP) origins. */
  const copyViaSelection = (): boolean => {
    const input = joinUrlRef.current;
    if (!input) {
      return false;
    }
    input.focus();
    input.select();
    input.setSelectionRange(0, joinUrl.length);
    try {
      return (
        typeof document !== 'undefined' &&
        typeof document.execCommand === 'function' &&
        document.execCommand('copy')
      );
    } catch {
      return false;
    }
  };

  const handleCopy = async () => {
    triggerTactileHaptic(reducedMotion);
    let copied = false;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(joinUrl);
        copied = true;
      }
    } catch {
      copied = false;
    }
    if (!copied) {
      copied = copyViaSelection();
    }
    setCopyStatus(copied ? COPY_SUCCESS : COPY_IDLE);
  };

  const handleShare = () => {
    triggerTactileHaptic(reducedMotion);
    if (supportsNativeShare()) {
      void navigator.share({ url: joinUrl }).catch(() => {
        // Sharing was cancelled or unavailable; the sheet stays usable.
      });
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="room-code-sheet-overlay"
          data-testid="room-code-share-sheet"
          role="dialog"
          aria-modal="true"
          aria-label="Room Code and QR join link"
          initial={reducedMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={reducedMotion ? undefined : { opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          <motion.div
            className="room-code-sheet"
            initial={reducedMotion ? false : { y: 32, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={reducedMotion ? undefined : { y: 32, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 280, damping: 28 }}
          >
            <div className="room-code-sheet-header">
              <span className="room-code-sheet-eyebrow">
                INVITE YOUR GROUP
              </span>
              <button
                type="button"
                className="room-code-sheet-close"
                data-testid="room-code-sheet-close"
                aria-label="Close share sheet"
                onClick={() => {
                  triggerTactileHaptic(reducedMotion);
                  onClose();
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
                  aria-hidden="true"
                  focusable="false"
                >
                  <line x1="6" y1="6" x2="18" y2="18" />
                  <line x1="18" y1="6" x2="6" y2="18" />
                </svg>
              </button>
            </div>

            <div className="lobby-qr-frame" data-testid="lobby-qr-frame">
              {qrSvg ? (
                <div
                  className="lobby-qr-svg"
                  data-testid="lobby-qr-svg"
                  role="img"
                  aria-label="Scan this QR code with your phone camera to join"
                  dangerouslySetInnerHTML={{ __html: qrSvg }}
                />
              ) : (
                <div
                  className="lobby-qr-loading"
                  data-testid="lobby-qr-loading"
                  aria-live="polite"
                >
                  Generating QR code…
                </div>
              )}
            </div>

            <div className="lobby-room-code-block">
              <span className="lobby-room-code-label">ROOM CODE</span>
              <span className="lobby-room-code" data-testid="lobby-room-code">
                {sessionCode}
              </span>
            </div>

            <label className="lobby-join-url-label" htmlFor="lobby-join-url">
              Join link
            </label>
            <div className="lobby-join-row">
              <input
                id="lobby-join-url"
                ref={joinUrlRef}
                className="lobby-join-url"
                data-testid="lobby-join-url"
                type="text"
                readOnly
                value={joinUrl}
                aria-label="Join link"
              />
              <button
                type="button"
                className="lobby-copy-link"
                data-testid="lobby-copy-link"
                onClick={() => {
                  void handleCopy();
                }}
              >
                Copy
              </button>
            </div>

            <div
              className="lobby-copy-status"
              data-testid="lobby-copy-status"
              role="status"
              aria-live="polite"
            >
              {copyStatus}
            </div>

            {supportsNativeShare() && (
              <button
                type="button"
                className="lobby-share-native"
                data-testid="lobby-share-native"
                onClick={handleShare}
              >
                Share link
              </button>
            )}

            {showLocalWarning && (
              <div
                className="lobby-localhost-warning"
                data-testid="lobby-localhost-warning"
                role="status"
              >
                This link only reaches this device — phones on other networks
                may not be able to open it. Run{' '}
                <code>npm run share</code> to open a public HTTPS tunnel, then
                restart the server with <code>PUBLIC_URL</code> set to the
                tunnel URL.
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
